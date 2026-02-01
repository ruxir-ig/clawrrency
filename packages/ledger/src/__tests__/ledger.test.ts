import { describe, it, expect, beforeEach } from 'bun:test';
import { InMemoryLedger } from '../ledger.js';
import { generateKeyPair, signTransaction } from '@clawrrency/core';
import type { Transaction } from '@clawrrency/core';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Ledger', () => {
  let ledger: InMemoryLedger;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `clawrrency-ledger-test-${Date.now()}`);
    const storagePath = path.join(tempDir, 'ledger.json');
    ledger = new InMemoryLedger(storagePath);
    await ledger.initialize();
  });

  describe('Account Management', () => {
    it('should create accounts', async () => {
      const keypair = await generateKeyPair();
      const account = await ledger.createAccount(keypair.public_key, 100);

      expect(account.public_key).toBe(keypair.public_key);
      expect(account.balance).toBe(100);
      expect(account.nonce).toBe(0);
    });

    it('should not create duplicate accounts', async () => {
      const keypair = await generateKeyPair();
      await ledger.createAccount(keypair.public_key);

      expect(async () => {
        await ledger.createAccount(keypair.public_key);
      }).toThrow('Account already exists');
    });

    it('should retrieve accounts', async () => {
      const keypair = await generateKeyPair();
      await ledger.createAccount(keypair.public_key, 50);

      const account = await ledger.getAccount(keypair.public_key);
      expect(account).not.toBeNull();
      expect(account?.balance).toBe(50);
    });

    it('should return null for non-existent accounts', async () => {
      const account = await ledger.getAccount('nonexistent');
      expect(account).toBeNull();
    });

    it('should check account existence', async () => {
      const keypair = await generateKeyPair();
      
      let exists = await ledger.accountExists(keypair.public_key);
      expect(exists).toBe(false);

      await ledger.createAccount(keypair.public_key);
      exists = await ledger.accountExists(keypair.public_key);
      expect(exists).toBe(true);
    });
  });

  describe('Balance Management', () => {
    it('should track balances', async () => {
      const keypair = await generateKeyPair();
      await ledger.createAccount(keypair.public_key, 1000);

      const balance = await ledger.getBalance(keypair.public_key);
      expect(balance).toBe(1000);
    });

    it('should return zero for non-existent accounts', async () => {
      const balance = await ledger.getBalance('nonexistent');
      expect(balance).toBe(0);
    });
  });

  describe('Transaction Processing', () => {
    it('should apply valid transfers', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 1000);
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 100,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, sender.private_key);
      const result = await ledger.applyTransaction({ ...tx, signature });

      expect(result.success).toBe(true);

      const senderBalance = await ledger.getBalance(sender.public_key);
      const recipientBalance = await ledger.getBalance(recipient.public_key);

      expect(senderBalance).toBe(899);
      expect(recipientBalance).toBe(200);
    });

    it('should reject duplicate transactions', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 1000);
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, sender.private_key);
      const signedTx = { ...tx, signature };

      const result1 = await ledger.applyTransaction(signedTx);
      expect(result1.success).toBe(true);

      const result2 = await ledger.applyTransaction(signedTx);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('duplicate');
    });

    it('should validate nonces', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 1000);
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 5,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, sender.private_key);
      const result = await ledger.applyTransaction({ ...tx, signature });

      expect(result.success).toBe(false);
      expect(result.error).toContain('nonce');
    });

    it('should reject invalid signatures', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();
      const attacker = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 1000);
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const wrongSignature = await signTransaction(tx, attacker.private_key);
      const result = await ledger.applyTransaction({ ...tx, signature: wrongSignature });

      expect(result.success).toBe(false);
      expect(result.error).toContain('signature');
    });

    it('should reject insufficient balance', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 10);
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 100,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, sender.private_key);
      const result = await ledger.applyTransaction({ ...tx, signature });

      expect(result.success).toBe(false);
      expect(result.error).toContain('balance');
    });

    it('should reject non-existent sender', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, sender.private_key);
      const result = await ledger.applyTransaction({ ...tx, signature });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Sender account not found');
    });

    it('should reject non-existent recipient', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 1000);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, sender.private_key);
      const result = await ledger.applyTransaction({ ...tx, signature });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Recipient account not found');
    });
  });

  describe('Transaction History', () => {
    it('should track transaction history', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 1000);
      await ledger.createAccount(recipient.public_key, 100);

      for (let i = 1; i <= 3; i++) {
        const tx: Omit<Transaction, 'signature'> = {
          version: 1,
          type: 'transfer',
          from: sender.public_key,
          to: recipient.public_key,
          amount: 10 * i,
          nonce: i,
          timestamp: Date.now(),
        };

        const signature = await signTransaction(tx, sender.private_key);
        await ledger.applyTransaction({ ...tx, signature });
      }

      const senderHistory = await ledger.getTransactionHistory(sender.public_key);
      const recipientHistory = await ledger.getTransactionHistory(recipient.public_key);

      expect(senderHistory.length).toBe(3);
      expect(recipientHistory.length).toBe(3);
    });

    it('should limit history results', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 10000);
      await ledger.createAccount(recipient.public_key, 100);

      for (let i = 1; i <= 10; i++) {
        const tx: Omit<Transaction, 'signature'> = {
          version: 1,
          type: 'transfer',
          from: sender.public_key,
          to: recipient.public_key,
          amount: 10,
          nonce: i,
          timestamp: Date.now(),
        };

        const signature = await signTransaction(tx, sender.private_key);
        await ledger.applyTransaction({ ...tx, signature });
      }

      const history = await ledger.getTransactionHistory(sender.public_key, 5);
      expect(history.length).toBe(5);
    });

    it('should retrieve transaction by hash', async () => {
      const sender = await generateKeyPair();
      const recipient = await generateKeyPair();

      await ledger.createAccount(sender.public_key, 1000);
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: sender.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, sender.private_key);
      await ledger.applyTransaction({ ...tx, signature });

      const allTxs = await ledger.getAllTransactions();
      expect(allTxs.length).toBeGreaterThan(0);
    });
  });

  describe('Block Height', () => {
    it('should track block height', async () => {
      const height = await ledger.getBlockHeight();
      expect(height).toBe(0);

      const newHeight = await ledger.incrementBlockHeight();
      expect(newHeight).toBe(1);

      const currentHeight = await ledger.getBlockHeight();
      expect(currentHeight).toBe(1);
    });
  });

  describe('Persistence', () => {
    it('should persist across instances', async () => {
      const keypair = await generateKeyPair();
      await ledger.createAccount(keypair.public_key, 500);

      const newLedger = new InMemoryLedger(ledger['storagePath']);
      await newLedger.initialize();

      const balance = await newLedger.getBalance(keypair.public_key);
      expect(balance).toBe(500);
    });
  });
});
