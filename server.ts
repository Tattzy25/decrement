import "dotenv/config";
import express from "express";
import { Transaction, TransactionType, CounterState } from "./src/types";
import { v4 as uuidv4 } from "uuid";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT);

  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

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
    const { sourceId, customerId, email, orderId, variantId, title, name, amount } = req.body;
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) return res.status(400).json({ error: "Amount must be a number" });
    const previousValue = state.currentValue;
    const newValue = previousValue + numericAmount;
    const timestamp = Date.now();
    const transaction: Transaction = {
      id: uuidv4(), timestamp, type: TransactionType.INCREMENT,
      amount: numericAmount, previousValue, newValue,
      metadata: { sourceId, customerId, email, orderId, variantId, title, name },
    };
    state.currentValue = newValue;
    state.lastTransaction = transaction;
    state.history = [transaction, ...state.history];
    fetch(process.env.WEBHOOK_I_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, customerId, email, orderId, variantId, title, name, amount: numericAmount, previousValue, newValue, timestamp }),
    }).catch(() => {});
    res.json({ currentValue: state.currentValue, transaction });
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
      body: JSON.stringify({ sourceId, customerId, versionId, model, trigger, amount: numericAmount, previousValue, newValue, timestamp }),
    }).catch(() => {});
    res.json({ currentValue: state.currentValue, transaction });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${process.env.APP_URL}`);
  });
}

startServer();
