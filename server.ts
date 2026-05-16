import "dotenv/config";
import express from "express";
import { readFileSync } from "fs";
import { Transaction, TransactionType, CounterState } from "./src/types";
import { v4 as uuidv4 } from "uuid";

function loadSettings() {
  const s = JSON.parse(readFileSync("./settings.json", "utf-8"));
  const env = process.env;
  return {
    server: {
      port: Number(env.PORT) || s.server.port.value as number,
      host: s.server.host.value as string,
      appUrl: env.APP_URL || s.server.appUrl.value as string,
    },
    cors: {
      enabled: s.cors.enabled.value as boolean,
      allowedOrigins: (s.cors.allowedOrigins.value as string).split(",").map((o: string) => o.trim()),
      allowedMethods: s.cors.allowedMethods.value as string[],
      allowedHeaders: (s.cors.allowedHeaders.value as string).split(",").map((h: string) => h.trim()),
    },
    routes: {
      increment: s.routes.increment.value as boolean,
      decrement: s.routes.decrement.value as boolean,
      transactions: s.routes.transactions.value as boolean,
      state: s.routes.state.value as boolean,
    },
    webhooks: {
      decrementWebhookUrl: env.WEBHOOK_URL || s.webhooks.decrementWebhookUrl.value as string,
      incrementWebhookUrl: env.WEBHOOK_I_URL || s.webhooks.incrementWebhookUrl.value as string,
      decrementWebhookEnabled: s.webhooks.decrementWebhookEnabled.value as boolean,
      incrementWebhookEnabled: s.webhooks.incrementWebhookEnabled.value as boolean,
      onWebhookFail: s.webhooks.onWebhookFail.value as "silent" | "log" | "retry" | "error",
      retryCount: s.webhooks.retryCount.value as number,
      retryDelayMs: s.webhooks.retryDelayMs.value as number,
    },
    zohoMcp: {
      enabled: s.zohoMcp.enabled.value as boolean,
      url: env.ZOHO_MCP_URL || s.zohoMcp.url.value as string,
      worksheetName: s.zohoMcp.worksheetName.value as string,
      resourceId: env.ZOHO_RESOURCE_ID || s.zohoMcp.resourceId.value as string,
      customerIdColumn: s.zohoMcp.customerIdColumn.value as string,
      balanceColumn: s.zohoMcp.balanceColumn.value as string,
      rowIndexColumn: s.zohoMcp.rowIndexColumn.value as string,
      timeoutMs: s.zohoMcp.timeoutMs.value as number,
    },
    custom: s.custom as Record<string, any>,
    balanceFetch: {
      onFetchFail: s.balanceFetch.onFetchFail.value as "error" | "default" | "reject",
      onNoCustomerRecord: s.balanceFetch.onNoCustomerRecord.value as "error" | "default" | "reject",
      onInvalidValue: s.balanceFetch.onInvalidValue.value as "error" | "default" | "reject",
      defaultBalance: s.balanceFetch.defaultBalance.value as number,
    },
    balanceRules: {
      allowNegativeBalance: s.balanceRules.allowNegativeBalance.value as boolean,
      minimumBalance: s.balanceRules.minimumBalance.value as number,
      maximumBalance: s.balanceRules.maximumBalance.value as number,
    },
    amountRules: {
      allowNegativeAmount: s.amountRules.allowNegativeAmount.value as boolean,
      allowZeroAmount: s.amountRules.allowZeroAmount.value as boolean,
      minimumAmount: s.amountRules.minimumAmount.value as number,
      maximumAmount: s.amountRules.maximumAmount.value as number,
    },
    rateLimit: {
      enabled: s.rateLimit.enabled.value as boolean,
      windowSeconds: s.rateLimit.windowSeconds.value as number,
      maxRequests: s.rateLimit.maxRequests.value as number,
    },
    logging: {
      requests: s.logging.requests.value as boolean,
      webhookErrors: s.logging.webhookErrors.value as boolean,
      balanceFetch: s.logging.balanceFetch.value as boolean,
    },
    response: {
      includeTransaction: s.response.includeTransaction.value as boolean,
    },
  };
}

type Settings = ReturnType<typeof loadSettings>;

async function getCustomerBalance(customerId: string, settings: Settings): Promise<number> {
  if (!settings.zohoMcp.enabled) return settings.balanceFetch.defaultBalance;

  if (settings.logging.balanceFetch) console.log(`[balance] fetching for ${customerId}`);

  let data: any;
  try {
    const res = await fetch(settings.zohoMcp.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "ZohoSheet_fetch_records_from_worksheet",
          arguments: {
            path_variables: { fetchrecordsfromworksheet: "v2", resource_id: settings.zohoMcp.resourceId },
            query_params: {
              method: "worksheet.records.fetch",
              worksheet_name: settings.zohoMcp.worksheetName,
              criteria_json: [{ key: settings.zohoMcp.customerIdColumn, operator: "EQUALS", matcher: String(customerId), type: "String" }],
              criteria_pattern: "1",
            },
          },
        },
      }),
      signal: AbortSignal.timeout(settings.zohoMcp.timeoutMs),
    });
    data = await res.json();
  } catch {
    const mode = settings.balanceFetch.onFetchFail;
    if (mode === "default") return settings.balanceFetch.defaultBalance;
    throw { status: mode === "reject" ? 402 : 500, message: "Failed to fetch customer balance" };
  }

  let records: any[];
  try {
    records = JSON.parse(data.result.content[0].text).records;
  } catch {
    const mode = settings.balanceFetch.onFetchFail;
    if (mode === "default") return settings.balanceFetch.defaultBalance;
    throw { status: mode === "reject" ? 402 : 500, message: "Failed to parse balance response" };
  }

  if (!records || records.length === 0) {
    const mode = settings.balanceFetch.onNoCustomerRecord;
    if (mode === "default") return settings.balanceFetch.defaultBalance;
    throw { status: 404, message: `No customer record found for ${customerId}` };
  }

  const rowCol = settings.zohoMcp.rowIndexColumn;
  const last = records.reduce((prev: any, curr: any) => curr[rowCol] > prev[rowCol] ? curr : prev);
  const value = Number(last[settings.zohoMcp.balanceColumn]);

  if (isNaN(value)) {
    const mode = settings.balanceFetch.onInvalidValue;
    if (mode === "default") return settings.balanceFetch.defaultBalance;
    throw { status: mode === "reject" ? 402 : 500, message: `Invalid balance value in record for ${customerId}` };
  }

  return value;
}

async function fireWebhook(url: string, body: object, settings: Settings): Promise<void> {
  const doFetch = () =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); });

  const { onWebhookFail, retryCount, retryDelayMs } = settings.webhooks;

  if (onWebhookFail === "retry") {
    for (let i = 0; i <= retryCount; i++) {
      try { await doFetch(); return; } catch (err) {
        if (i === retryCount) {
          if (settings.logging.webhookErrors) console.error("Webhook failed after retries:", err);
          return;
        }
        await new Promise(r => setTimeout(r, retryDelayMs));
      }
    }
    return;
  }

  try {
    await doFetch();
  } catch (err) {
    if (onWebhookFail === "log" && settings.logging.webhookErrors) console.error("Webhook failed:", err);
    else if (onWebhookFail === "error") throw err;
  }
}

async function startServer() {
  const settings = loadSettings();
  const app = express();
  const PORT = settings.server.port;

  app.use(express.json());

  if (settings.logging.requests) {
    app.use((req, _res, next) => { console.log(`[req] ${req.method} ${req.path}`); next(); });
  }

  if (settings.cors.enabled) {
    app.use((req, res, next) => {
      const origins = settings.cors.allowedOrigins;
      const origin = req.headers.origin ?? "";
      const allowed = origins.includes("*") ? "*" : origins.includes(origin) ? origin : "";
      if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);
      res.setHeader("Access-Control-Allow-Methods", settings.cors.allowedMethods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", settings.cors.allowedHeaders.join(", "));
      if (req.method === "OPTIONS") return res.sendStatus(204);
      next();
    });
  }

  if (settings.rateLimit.enabled) {
    const windowMs = settings.rateLimit.windowSeconds * 1000;
    const counts = new Map<string, { count: number; reset: number }>();
    app.use((req, res, next) => {
      const key = req.ip ?? "unknown";
      const now = Date.now();
      let entry = counts.get(key);
      if (!entry || now > entry.reset) { entry = { count: 0, reset: now + windowMs }; counts.set(key, entry); }
      if (++entry.count > settings.rateLimit.maxRequests) return res.status(429).json({ error: "Rate limit exceeded" });
      next();
    });
  }

  const state: CounterState = { currentValue: 0, lastTransaction: null, history: [] };

  if (settings.routes.state) {
    app.get("/api/state", (_req, res) => { res.json(state); });
  }

  if (settings.routes.transactions) {
    app.post("/api/transactions", (req, res) => {
      const { type, amount, metadata } = req.body;
      if (!Object.values(TransactionType).includes(type)) return res.status(400).json({ error: "Invalid transaction type" });
      const numericAmount = Number(amount);
      if (isNaN(numericAmount)) return res.status(400).json({ error: "Amount must be a number" });

      const previousValue = state.currentValue;
      let newValue = previousValue;
      if (type === TransactionType.INCREMENT) newValue += numericAmount;
      else if (type === TransactionType.DECREMENT) newValue -= numericAmount;
      else if (type === TransactionType.SET) newValue = numericAmount;

      const transaction: Transaction = { id: uuidv4(), timestamp: Date.now(), type, amount: numericAmount, previousValue, newValue, metadata };
      state.currentValue = newValue;
      state.lastTransaction = transaction;
      state.history = [transaction, ...state.history];
      res.json({ state, transaction });
    });
  }

  if (settings.routes.increment) {
    app.post("/api/increment", async (req, res) => {
      const { sourceId, customerId, email, orderId, variantId, title, name, amount } = req.body;
      const numericAmount = Number(amount);
      if (isNaN(numericAmount)) return res.status(400).json({ error: "Amount must be a number" });

      const ar = settings.amountRules;
      if (!ar.allowNegativeAmount && numericAmount < 0) return res.status(400).json({ error: "Negative amounts are not allowed" });
      if (!ar.allowZeroAmount && numericAmount === 0) return res.status(400).json({ error: "Zero amounts are not allowed" });
      if (ar.minimumAmount > 0 && numericAmount < ar.minimumAmount) return res.status(400).json({ error: `Amount must be at least ${ar.minimumAmount}` });
      if (ar.maximumAmount > 0 && numericAmount > ar.maximumAmount) return res.status(400).json({ error: `Amount must not exceed ${ar.maximumAmount}` });

      let previousValue: number;
      try { previousValue = await getCustomerBalance(customerId, settings); }
      catch (err: any) { return res.status(err.status ?? 500).json({ error: err.message ?? "Balance fetch failed" }); }

      const newValue = previousValue + numericAmount;
      const br = settings.balanceRules;
      if (!br.allowNegativeBalance && newValue < 0) return res.status(400).json({ error: "Transaction would result in negative balance" });
      if (br.minimumBalance > 0 && newValue < br.minimumBalance) return res.status(400).json({ error: `Balance must be at least ${br.minimumBalance}` });
      if (br.maximumBalance > 0 && newValue > br.maximumBalance) return res.status(400).json({ error: `Balance must not exceed ${br.maximumBalance}` });

      const timestamp = Date.now();
      const transaction: Transaction = {
        id: uuidv4(), timestamp, type: TransactionType.INCREMENT,
        amount: numericAmount, previousValue, newValue,
        metadata: { sourceId, customerId, email, orderId, variantId, title, name },
      };
      const webhookBody = { sourceId, customerId, email, orderId, variantId, title, name, amount: numericAmount, previousValue, newValue, timestamp };

      if (settings.webhooks.incrementWebhookEnabled) {
        if (settings.webhooks.onWebhookFail === "error") {
          try { await fireWebhook(settings.webhooks.incrementWebhookUrl, webhookBody, settings); }
          catch { return res.status(502).json({ error: "Webhook delivery failed" }); }
        } else {
          fireWebhook(settings.webhooks.incrementWebhookUrl, webhookBody, settings).catch(() => {});
        }
      }

      const body: any = { currentValue: newValue };
      if (settings.response.includeTransaction) body.transaction = transaction;
      res.json(body);
    });
  }

  if (settings.routes.decrement) {
    app.post("/api/decrement", async (req, res) => {
      const { sourceId, customerId, versionId, model, trigger, amount } = req.body;
      const numericAmount = Number(amount);
      if (isNaN(numericAmount)) return res.status(400).json({ error: "Amount must be a number" });

      const ar = settings.amountRules;
      if (!ar.allowNegativeAmount && numericAmount < 0) return res.status(400).json({ error: "Negative amounts are not allowed" });
      if (!ar.allowZeroAmount && numericAmount === 0) return res.status(400).json({ error: "Zero amounts are not allowed" });
      if (ar.minimumAmount > 0 && numericAmount < ar.minimumAmount) return res.status(400).json({ error: `Amount must be at least ${ar.minimumAmount}` });
      if (ar.maximumAmount > 0 && numericAmount > ar.maximumAmount) return res.status(400).json({ error: `Amount must not exceed ${ar.maximumAmount}` });

      let previousValue: number;
      try { previousValue = await getCustomerBalance(customerId, settings); }
      catch (err: any) { return res.status(err.status ?? 500).json({ error: err.message ?? "Balance fetch failed" }); }

      const newValue = previousValue - numericAmount;
      const br = settings.balanceRules;
      if (!br.allowNegativeBalance && newValue < 0) return res.status(400).json({ error: "Transaction would result in negative balance" });
      if (br.minimumBalance > 0 && newValue < br.minimumBalance) return res.status(400).json({ error: `Balance must be at least ${br.minimumBalance}` });
      if (br.maximumBalance > 0 && newValue > br.maximumBalance) return res.status(400).json({ error: `Balance must not exceed ${br.maximumBalance}` });

      const timestamp = Date.now();
      const transaction: Transaction = {
        id: uuidv4(), timestamp, type: TransactionType.DECREMENT,
        amount: numericAmount, previousValue, newValue,
        metadata: { sourceId, customerId, versionId, model, trigger },
      };
      const webhookBody = { sourceId, customerId, versionId, model, trigger, amount: numericAmount, previousValue, newValue, timestamp };

      if (settings.webhooks.decrementWebhookEnabled) {
        if (settings.webhooks.onWebhookFail === "error") {
          try { await fireWebhook(settings.webhooks.decrementWebhookUrl, webhookBody, settings); }
          catch { return res.status(502).json({ error: "Webhook delivery failed" }); }
        } else {
          fireWebhook(settings.webhooks.decrementWebhookUrl, webhookBody, settings).catch(() => {});
        }
      }

      const body: any = { currentValue: newValue };
      if (settings.response.includeTransaction) body.transaction = transaction;
      res.json(body);
    });
  }

  app.listen(PORT, settings.server.host, () => {
    console.log(`Server running on ${settings.server.appUrl}`);
  });
}

startServer();
