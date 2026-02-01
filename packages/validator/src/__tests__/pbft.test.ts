import { describe, it, expect, beforeEach } from 'bun:test';
import { PBFTValidator } from '../pbft.js';
import { InMemoryLedger } from '@clawrrency/ledger';
import { generateKeyPair, signTransaction } from '@clawrrency/core';
import type { Transaction } from '@clawrrency/core';
import * as path from 'node:path';
import * as os from 'node:os';

describe('PBFT Validator', () => {
  let ledger: InMemoryLedger;
  let validator: PBFTValidator;
  let tempDir: string;
  let keypair: { public_key: string; private_key: string };

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `clawrrency-pbft-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const storagePath = path.join(tempDir, 'ledger.json');
    ledger = new InMemoryLedger(storagePath);
    await ledger.initialize();

    keypair = await generateKeyPair();
    
    const config = {
      validator_id: 'validator-1',
      public_key: keypair.public_key,
      private_key: keypair.private_key,
      peers: [],
      view_timeout_ms: 5000,
    };

    validator = new PBFTValidator(config, ledger);
    await validator.initialize();

    await ledger.createAccount(keypair.public_key, 1000);
  });

  describe('Initialization', () => {
    it('should initialize as leader when no peers', () => {
      expect(validator.isLeader()).toBe(true);
    });

    it('should get correct leader ID', () => {
      expect(validator.getLeaderId()).toBe('validator-1');
    });

    it('should start at view 0', () => {
      expect(validator.getView()).toBe(0);
    });
  });

  describe('Transaction Submission', () => {
    it('should accept valid transactions', async () => {
      const recipient = await generateKeyPair();
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: keypair.public_key,
        to: recipient.public_key,
        amount: 100,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, keypair.private_key);
      const result = await validator.submitTransaction({ ...tx, signature });

      expect(result.success).toBe(true);
    });

    it('should reject duplicate transactions', async () => {
      const recipient = await generateKeyPair();
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: keypair.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, keypair.private_key);
      const signedTx = { ...tx, signature };

      const result1 = await validator.submitTransaction(signedTx);
      expect(result1.success).toBe(true);

      const result2 = await validator.submitTransaction(signedTx);
      expect(result2.success).toBe(false);
    });

    it('should reject transactions with invalid signatures', async () => {
      const recipient = await generateKeyPair();
      await ledger.createAccount(recipient.public_key, 100);

      const attacker = await generateKeyPair();

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: keypair.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const wrongSignature = await signTransaction(tx, attacker.private_key);
      const result = await validator.submitTransaction({ ...tx, signature: wrongSignature });

      expect(result.success).toBe(false);
    });

    it('should process transactions immediately as leader', async () => {
      const recipient = await generateKeyPair();
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: keypair.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, keypair.private_key);
      const result = await validator.submitTransaction({ ...tx, signature });

      expect(result.success).toBe(true);
      
      const recipientBalance = await ledger.getBalance(recipient.public_key);
      expect(recipientBalance).toBe(150);
    });
  });

  describe('Consensus Status', () => {
    it('should return status information', async () => {
      const status = await validator.getStatus();

      expect(status.view).toBe(0);
      expect(status.is_leader).toBe(true);
      expect(status.leader_id).toBe('validator-1');
      expect(status.pending_count).toBe(0);
    });

    it('should track message log', async () => {
      const recipient = await generateKeyPair();
      await ledger.createAccount(recipient.public_key, 100);

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: keypair.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, keypair.private_key);
      await validator.submitTransaction({ ...tx, signature });

      const log = validator.getMessageLog();
      expect(log.length).toBeGreaterThan(0);
    });
  });

  describe('Commit Callbacks', () => {
    it('should trigger callbacks on commit', async () => {
      const recipient = await generateKeyPair();
      await ledger.createAccount(recipient.public_key, 100);

      let committedTx: Transaction | null = null;
      validator.onCommit((tx) => {
        committedTx = tx;
      });

      const tx: Omit<Transaction, 'signature'> = {
        version: 1,
        type: 'transfer',
        from: keypair.public_key,
        to: recipient.public_key,
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await signTransaction(tx, keypair.private_key);
      await validator.submitTransaction({ ...tx, signature });
    });
  });
});
