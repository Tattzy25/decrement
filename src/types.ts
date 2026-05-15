export enum TransactionType {
  INCREMENT = 'INCREMENT',
  DECREMENT = 'DECREMENT',
  SET = 'SET',
}

export interface Transaction {
  id: string;
  timestamp: number;
  type: TransactionType;
  amount: number;
  previousValue: number;
  newValue: number;
  metadata?: Record<string, any>; // Easily customizable fields like customerId
}

export interface CounterState {
  currentValue: number;
  lastTransaction: Transaction | null;
  history: Transaction[];
}
