import type { Transaction, Account } from '@clawrrency/core';

export interface Ledger {
  initialize(): Promise<void>;
  getAccount(public_key: string): Promise<Account | null>;
  getBalance(public_key: string): Promise<number>;
  applyTransaction(tx: Transaction): Promise<boolean>;
  getTransactionHistory(public_key: string): Promise<Transaction[]>;
}

export class SqliteLedger implements Ledger {
  async initialize(): Promise<void> {
    // TODO: Implement database initialization
    throw new Error('Not implemented');
  }

  async getAccount(public_key: string): Promise<Account | null> {
    // TODO: Implement account retrieval
    throw new Error('Not implemented');
  }

  async getBalance(public_key: string): Promise<number> {
    // TODO: Implement balance query
    throw new Error('Not implemented');
  }

  async applyTransaction(_tx: Transaction): Promise<boolean> {
    // TODO: Implement transaction application
    throw new Error('Not implemented');
  }

  async getTransactionHistory(_public_key: string): Promise<Transaction[]> {
    // TODO: Implement history retrieval
    throw new Error('Not implemented');
  }
}
