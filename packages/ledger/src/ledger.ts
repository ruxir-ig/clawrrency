import type { Transaction, Account } from '@clawrrency/core';
import { hashTransaction, verifyTransactionSignature } from '@clawrrency/core';
import { validateEconomicConstraints } from '@clawrrency/core/economy';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface Ledger {
  initialize(): Promise<void>;
  getAccount(public_key: string): Promise<Account | null>;
  getBalance(public_key: string): Promise<number>;
  applyTransaction(tx: Transaction): Promise<{ success: boolean; error?: string }>;
  getTransactionHistory(public_key: string, limit?: number): Promise<Transaction[]>;
  getTransactionByHash(hash: string): Promise<Transaction | null>;
  getAllTransactions(limit?: number, offset?: number): Promise<Transaction[]>;
  getBlockHeight(): Promise<number>;
  accountExists(public_key: string): Promise<boolean>;
  createAccount(public_key: string, initial_balance?: number): Promise<Account>;
}

interface StoredTransaction extends Transaction {
  hash: string;
  block_height: number;
  applied_at: number;
}

interface StoredAccount extends Account {
  updated_at: number;
}

interface LedgerState {
  version: number;
  block_height: number;
  accounts: Record<string, StoredAccount>;
  transactions: Record<string, StoredTransaction>;
  account_transactions: Record<string, string[]>;
}

export class InMemoryLedger implements Ledger {
  private state: LedgerState;
  private initialized: boolean = false;
  private storagePath: string;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(os.homedir(), '.clawrrency', 'ledger.json');
    this.state = {
      version: 1,
      block_height: 0,
      accounts: {},
      transactions: {},
      account_transactions: {},
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      this.state = JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.saveState();
    }

    this.initialized = true;
  }

  private async saveState(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(this.state, null, 2));
  }

  async getAccount(public_key: string): Promise<Account | null> {
    await this.initialize();
    const stored = this.state.accounts[public_key];
    if (!stored) return null;

    return {
      public_key: stored.public_key,
      balance: stored.balance,
      nonce: stored.nonce,
      reputation: stored.reputation,
      created_at: stored.created_at,
      last_active: stored.last_active,
      stake_locked: stored.stake_locked,
      stake_unlock_at: stored.stake_unlock_at,
    };
  }

  async getBalance(public_key: string): Promise<number> {
    await this.initialize();
    const account = this.state.accounts[public_key];
    return account?.balance || 0;
  }

  async accountExists(public_key: string): Promise<boolean> {
    await this.initialize();
    return public_key in this.state.accounts;
  }

  async createAccount(public_key: string, initial_balance: number = 0): Promise<Account> {
    await this.initialize();
    
    if (this.state.accounts[public_key]) {
      throw new Error('Account already exists');
    }

    const now = Date.now();
    const account: StoredAccount = {
      public_key,
      balance: initial_balance,
      nonce: 0,
      reputation: 0,
      created_at: now,
      last_active: now,
      updated_at: now,
      stake_locked: 0,
    };

    this.state.accounts[public_key] = account;
    this.state.account_transactions[public_key] = [];
    await this.saveState();

    return {
      public_key: account.public_key,
      balance: account.balance,
      nonce: account.nonce,
      reputation: account.reputation,
      created_at: account.created_at,
      last_active: account.last_active,
      stake_locked: account.stake_locked,
      stake_unlock_at: account.stake_unlock_at,
    };
  }

  async applyTransaction(tx: Transaction): Promise<{ success: boolean; error?: string }> {
    await this.initialize();

    const txHash = hashTransaction(tx);

    if (this.state.transactions[txHash]) {
      return { success: false, error: 'Transaction already exists (duplicate)' };
    }

    const sender = this.state.accounts[tx.from];
    if (!sender) {
      return { success: false, error: 'Sender account not found' };
    }

    if (tx.nonce !== sender.nonce + 1) {
      return { success: false, error: `Invalid nonce. Expected: ${sender.nonce + 1}, Got: ${tx.nonce}` };
    }

    const isValidSig = await verifyTransactionSignature({ ...tx, signature: tx.signature });
    if (!isValidSig) {
      return { success: false, error: 'Invalid transaction signature' };
    }

    const economicCheck = validateEconomicConstraints(tx, sender.balance);
    if (!economicCheck.valid) {
      return { success: false, error: economicCheck.error };
    }

    if (tx.type === 'transfer' && tx.to) {
      const recipient = this.state.accounts[tx.to];
      if (!recipient) {
        return { success: false, error: 'Recipient account not found' };
      }

      const fee = 1;
      const totalDebit = tx.amount + fee;

      if (sender.balance < totalDebit) {
        return { success: false, error: 'Insufficient balance' };
      }

      sender.balance -= totalDebit;
      recipient.balance += tx.amount;

      sender.nonce = tx.nonce;
      sender.last_active = Date.now();
      sender.updated_at = Date.now();
      recipient.updated_at = Date.now();
    }

    const storedTx: StoredTransaction = {
      ...tx,
      hash: txHash,
      block_height: this.state.block_height,
      applied_at: Date.now(),
    };

    this.state.transactions[txHash] = storedTx;
    
    if (!this.state.account_transactions[tx.from]) {
      this.state.account_transactions[tx.from] = [];
    }
    this.state.account_transactions[tx.from].push(txHash);

    if (tx.to && tx.to !== tx.from) {
      if (!this.state.account_transactions[tx.to]) {
        this.state.account_transactions[tx.to] = [];
      }
      this.state.account_transactions[tx.to].push(txHash);
    }

    await this.saveState();

    return { success: true };
  }

  async getTransactionHistory(public_key: string, limit: number = 100): Promise<Transaction[]> {
    await this.initialize();
    
    const txHashes = this.state.account_transactions[public_key] || [];
    const transactions = txHashes
      .slice(-limit)
      .map(hash => this.state.transactions[hash])
      .filter(Boolean)
      .sort((a, b) => b.applied_at - a.applied_at);

    return transactions.map(tx => ({
      version: tx.version,
      type: tx.type,
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      nonce: tx.nonce,
      timestamp: tx.timestamp,
      data: tx.data,
      signature: tx.signature,
    }));
  }

  async getTransactionByHash(hash: string): Promise<Transaction | null> {
    await this.initialize();
    const tx = this.state.transactions[hash];
    if (!tx) return null;

    return {
      version: tx.version,
      type: tx.type,
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      nonce: tx.nonce,
      timestamp: tx.timestamp,
      data: tx.data,
      signature: tx.signature,
    };
  }

  async getAllTransactions(limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    await this.initialize();
    
    const allTxs = Object.values(this.state.transactions)
      .sort((a, b) => b.applied_at - a.applied_at)
      .slice(offset, offset + limit);

    return allTxs.map(tx => ({
      version: tx.version,
      type: tx.type,
      from: tx.from,
      to: tx.to,
      amount: tx.amount,
      nonce: tx.nonce,
      timestamp: tx.timestamp,
      data: tx.data,
      signature: tx.signature,
    }));
  }

  async getBlockHeight(): Promise<number> {
    await this.initialize();
    return this.state.block_height;
  }

  async incrementBlockHeight(): Promise<number> {
    await this.initialize();
    this.state.block_height++;
    await this.saveState();
    return this.state.block_height;
  }

  getState(): LedgerState {
    return { ...this.state };
  }
}

export { InMemoryLedger as SqliteLedger };
