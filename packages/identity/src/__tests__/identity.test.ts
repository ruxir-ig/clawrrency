import { describe, it, expect, beforeEach } from 'bun:test';
import { IdentityManager, BotWallet } from '../identity.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Identity System', () => {
  let manager: IdentityManager;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `clawrrency-test-${Date.now()}`);
    const storagePath = path.join(tempDir, 'identities.json');
    manager = new IdentityManager(storagePath);
    await manager.initialize();
  });

  describe('Wallet Creation', () => {
    it('should create wallets with unique keys', async () => {
      const wallet1 = await manager.createWallet({ name: 'Bot1' });
      const wallet2 = await manager.createWallet({ name: 'Bot2' });

      expect(wallet1.public_key).toBeDefined();
      expect(wallet2.public_key).toBeDefined();
      expect(wallet1.public_key).not.toBe(wallet2.public_key);
    });

    it('should store wallet metadata', async () => {
      const metadata = { 
        name: 'TestBot', 
        description: 'A test bot',
        version: '1.0.0'
      };
      const wallet = await manager.createWallet(metadata);
      const identity = await manager.getIdentity(wallet.public_key);

      expect(identity?.metadata?.name).toBe('TestBot');
      expect(identity?.metadata?.description).toBe('A test bot');
    });

    it('should load existing wallets', async () => {
      const wallet = await manager.createWallet({ name: 'LoadTest' });
      const loaded = await manager.loadWallet(wallet.public_key);

      expect(loaded).not.toBeNull();
      expect(loaded?.public_key).toBe(wallet.public_key);
    });

    it('should return null for unknown wallets', async () => {
      const loaded = await manager.loadWallet('unknown_key');
      expect(loaded).toBeNull();
    });
  });

  describe('Bot Registration', () => {
    it('should register bots with sufficient stake', async () => {
      const wallet = await manager.createWallet();
      const result = await manager.registerBot(wallet.public_key, 50);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject registration with insufficient stake', async () => {
      const wallet = await manager.createWallet();
      const result = await manager.registerBot(wallet.public_key, 10);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient stake');
    });

    it('should accept reduced stake with attestation', async () => {
      const wallet = await manager.createWallet();
      
      const attester = await manager.createWallet();
      await manager.updateReputation(attester.public_key, {
        successful_trades: 20,
        skills_created: 5,
      });
      
      const result = await manager.registerBot(wallet.public_key, 25, attester.public_key);
      expect(result.success).toBe(true);
    });

    it('should track stake lock period', async () => {
      const wallet = await manager.createWallet();
      await manager.registerBot(wallet.public_key, 50);

      const identity = await manager.getIdentity(wallet.public_key);
      expect(identity?.staked_amount).toBe(50);
      expect(identity?.stake_locked_until).toBeGreaterThan(Date.now());
    });

    it('should check registration status', async () => {
      const wallet = await manager.createWallet();
      
      let isRegistered = await manager.isRegistered(wallet.public_key);
      expect(isRegistered).toBe(false);

      await manager.registerBot(wallet.public_key, 50);
      isRegistered = await manager.isRegistered(wallet.public_key);
      expect(isRegistered).toBe(true);
    });
  });

  describe('Reputation Management', () => {
    it('should calculate reputation from activities', async () => {
      const wallet = await manager.createWallet();
      
      const reputation = await manager.updateReputation(wallet.public_key, {
        successful_trades: 10,
        skills_created: 2,
      });

      expect(reputation).toBeGreaterThan(0);
    });

    it('should retrieve reputation', async () => {
      const wallet = await manager.createWallet();
      await manager.updateReputation(wallet.public_key, {
        successful_trades: 5,
      });

      const reputation = await manager.getReputation(wallet.public_key);
      expect(reputation).toBeGreaterThan(0);
    });

    it('should return zero for unknown bots', async () => {
      const reputation = await manager.getReputation('unknown');
      expect(reputation).toBe(0);
    });

    it('should penalize bad behavior', async () => {
      const wallet = await manager.createWallet();
      
      const goodRep = await manager.updateReputation(wallet.public_key, {
        successful_trades: 20,
      });

      const badRep = await manager.updateReputation(wallet.public_key, {
        successful_trades: 20,
        disputes_lost: 5,
        spam_flags: 2,
      });

      expect(badRep).toBeLessThan(goodRep);
    });
  });

  describe('Attestations', () => {
    it('should track who attested for whom', async () => {
      const wallet = await manager.createWallet();
      const attester = await manager.createWallet();
      
      await manager.updateReputation(attester.public_key, {
        successful_trades: 20,
        skills_created: 5,
      });

      await manager.registerBot(wallet.public_key, 25, attester.public_key);
      
      const attestations = await manager.getAttestations(wallet.public_key);
      expect(attestations).toContain(attester.public_key);
    });

    it('should check attestation eligibility', async () => {
      const lowRepBot = await manager.createWallet();
      const highRepBot = await manager.createWallet();
      
      await manager.updateReputation(highRepBot.public_key, {
        successful_trades: 20,
        skills_created: 5,
      });

      const canAttestLow = await manager.canAttest(lowRepBot.public_key);
      const canAttestHigh = await manager.canAttest(highRepBot.public_key);

      expect(canAttestLow).toBe(false);
      expect(canAttestHigh).toBe(true);
    });
  });

  describe('Wallet Operations', () => {
    it('should sign transactions', async () => {
      const wallet = await BotWallet.create();
      
      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: wallet.public_key,
        to: 'recipient',
        amount: 100,
        nonce: 1,
        timestamp: Date.now(),
      };

      const signature = await wallet.signTransaction(tx);
      expect(signature).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should check stake lock status', async () => {
      const wallet = await manager.createWallet();
      
      let hasStake = wallet.hasStakeLocked();
      expect(hasStake).toBe(false);

      await manager.registerBot(wallet.public_key, 50);
      
      const loadedWallet = await manager.loadWallet(wallet.public_key);
      hasStake = loadedWallet?.hasStakeLocked() || false;
      expect(hasStake).toBe(true);
    });

    it('should list all identities', async () => {
      await manager.createWallet({ name: 'Bot1' });
      await manager.createWallet({ name: 'Bot2' });
      await manager.createWallet({ name: 'Bot3' });

      const identities = await manager.listIdentities();
      expect(identities.length).toBe(3);
    });
  });

  describe('Persistence', () => {
    it('should persist data across instances', async () => {
      const wallet = await manager.createWallet({ name: 'PersistTest' });
      await manager.registerBot(wallet.public_key, 50);
      await manager.updateReputation(wallet.public_key, {
        successful_trades: 10,
      });

      const newManager = new IdentityManager(manager['storagePath']);
      await newManager.initialize();

      const loaded = await newManager.loadWallet(wallet.public_key);
      expect(loaded).not.toBeNull();

      const reputation = await newManager.getReputation(wallet.public_key);
      expect(reputation).toBeGreaterThan(0);
    });
  });
});
