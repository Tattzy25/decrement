import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Transaction, TransactionType, CounterState } from "./src/types";
import { v4 as uuidv4 } from "uuid";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT);

  app.use(express.json());

  // In-memory state for this simple widget
  // In a real production app, you might use a database.
  let state: CounterState = {
    currentValue: 0,
    lastTransaction: null,
    history: [],
  };

  // API Routes
  app.get("/api/state", (req, res) => {
    res.json(state);
  });

  app.post("/api/transactions", (req, res) => {
    const { type, amount, metadata } = req.body;

    if (!Object.values(TransactionType).includes(type)) {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) {
      return res.status(400).json({ error: "Amount must be a number" });
    }

    const previousValue = state.currentValue;
    let newValue = previousValue;

    if (type === TransactionType.INCREMENT) {
      newValue += numericAmount;
    } else if (type === TransactionType.DECREMENT) {
      newValue -= numericAmount;
    } else if (type === TransactionType.SET) {
      newValue = numericAmount;
    }

    const transaction: Transaction = {
      id: uuidv4(),
      timestamp: Date.now(),
      type,
      amount: numericAmount,
      previousValue,
      newValue,
      metadata,
    };

    state.currentValue = newValue;
    state.lastTransaction = transaction;
    state.history = [transaction, ...state.history];

    res.json({ state, transaction });
  });

  app.post("/api/increment", (req, res) => {
    const { amount, customerId } = req.body;
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) return res.status(400).json({ error: "Amount must be a number" });
    const previousValue = state.currentValue;
    const newValue = previousValue + numericAmount;
    const transaction: Transaction = {
      id: uuidv4(), timestamp: Date.now(), type: TransactionType.INCREMENT,
      amount: numericAmount, previousValue, newValue, metadata: { customerId },
    };
    state.currentValue = newValue;
    state.lastTransaction = transaction;
    state.history = [transaction, ...state.history];
    res.json({ state, transaction });
  });

  app.post("/api/decrement", (req, res) => {
    const { sourceId, customerId, versionId, model, trigger, amount } = req.body;
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) return res.status(400).json({ error: "Amount must be a number" });
    const previousValue = state.currentValue;
    const newValue = previousValue - numericAmount;
    const timestamp = Date.now();
    const transaction: Transaction = {
      id: uuidv4(), timestamp, type: TransactionType.DECREMENT,
      amount: numericAmount, previousValue, newValue,
      metadata: { sourceId, customerId, versionId, model, trigger },
    };
    state.currentValue = newValue;
    state.lastTransaction = transaction;
    state.history = [transaction, ...state.history];
    fetch(process.env.WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, customerId, versionId, model, trigger, amount: numericAmount, previousValue, newValue, metadata: { sourceId, customerId, versionId, model, trigger }, timestamp }),
    }).catch(() => {});
    res.json({ state, transaction });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
