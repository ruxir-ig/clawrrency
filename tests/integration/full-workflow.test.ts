import { describe, it, expect, beforeEach } from 'bun:test';
import { ClawrrencySDK } from '../../packages/sdk/src/sdk';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Integration: Full Bot Workflow', () => {
  let sdk: ClawrrencySDK;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `clawrrency-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    
    sdk = new ClawrrencySDK({ dataDir: tempDir });
    await sdk.initialize();
  });

  it('should create wallet and check balance', async () => {
    const wallet = await sdk.identity.createWallet({ name: 'TestBot' });
    expect(wallet.public_key).toBeDefined();

    const balance = await wallet.getBalance();
    expect(balance).toBe(0);
  });

  it('should register bot with stake', async () => {
    const wallet = await sdk.identity.createWallet();
    await sdk.ledger.createAccount(wallet.public_key, 100);

    const result = await sdk.identity.registerBot(wallet.public_key, 50);
    expect(result.success).toBe(true);

    const isRegistered = await sdk.identity.isRegistered(wallet.public_key);
    expect(isRegistered).toBe(true);
  });

  it('should transfer between accounts', async () => {
    const sender = await sdk.identity.createWallet();
    const recipient = await sdk.identity.createWallet();

    await sdk.ledger.createAccount(sender.public_key, 1000);
    await sdk.ledger.createAccount(recipient.public_key, 100);

    const initialBalance = await sdk.ledger.getBalance(recipient.public_key);
    expect(initialBalance).toBe(100);

    const senderAccount = await sdk.ledger.getAccount(sender.public_key);
    const tx = {
      version: 1 as const,
      type: 'transfer' as const,
      from: sender.public_key,
      to: recipient.public_key,
      amount: 50,
      nonce: (senderAccount?.nonce || 0) + 1,
      timestamp: Date.now(),
    };

    const signature = await sender.signTransaction(tx);
    const result = await sdk.ledger.applyTransaction({ ...tx, signature });

    expect(result.success).toBe(true);

    const finalBalance = await sdk.ledger.getBalance(recipient.public_key);
    expect(finalBalance).toBe(150);
  });

  it('should create and list skill', async () => {
    const creator = await sdk.identity.createWallet();
    await sdk.ledger.createAccount(creator.public_key, 100);

    const result = await sdk.marketplace.createSkill(
      'TestSkill',
      'A test skill',
      '1.0.0',
      'skill',
      [{ path: 'index.js', content: 'module.exports = {};' }],
      creator.public_key
    );

    expect(result.success).toBe(true);
    expect(result.skill).toBeDefined();

    const listResult = await sdk.marketplace.listSkill(
      result.skill!.id,
      100,
      creator.public_key
    );

    expect(listResult.success).toBe(true);

    const listings = await sdk.marketplace.getActiveListings();
    expect(listings.length).toBe(1);
  });

  it('should purchase skill', async () => {
    const creator = await sdk.identity.createWallet();
    const buyer = await sdk.identity.createWallet();

    await sdk.ledger.createAccount(creator.public_key, 100);
    await sdk.ledger.createAccount(buyer.public_key, 1000);

    const skillResult = await sdk.marketplace.createSkill(
      'PremiumSkill',
      'A premium skill',
      '1.0.0',
      'skill',
      [{ path: 'index.js', content: '/* premium code */' }],
      creator.public_key
    );

    await sdk.marketplace.listSkill(skillResult.skill!.id, 50, creator.public_key);

    const purchaseResult = await sdk.marketplace.purchaseSkill(
      skillResult.skill!.id,
      buyer.public_key,
      '' // Would need actual private key in real scenario
    );

    expect(purchaseResult.success).toBe(false);
    expect(purchaseResult.error).toContain('signature');
  });

  it('should track reputation', async () => {
    const wallet = await sdk.identity.createWallet();

    const initialRep = await sdk.identity.getReputation(wallet.public_key);
    expect(initialRep).toBe(0);

    await sdk.identity.updateReputation(wallet.public_key, {
      successful_trades: 10,
      skills_created: 2,
    });

    const updatedRep = await sdk.identity.getReputation(wallet.public_key);
    expect(updatedRep).toBeGreaterThan(0);
  });

  it('should get transaction history', async () => {
    const sender = await sdk.identity.createWallet();
    const recipient = await sdk.identity.createWallet();

    await sdk.ledger.createAccount(sender.public_key, 1000);
    await sdk.ledger.createAccount(recipient.public_key, 100);

    const account = await sdk.ledger.getAccount(sender.public_key);
    const tx = {
      version: 1 as const,
      type: 'transfer' as const,
      from: sender.public_key,
      to: recipient.public_key,
      amount: 100,
      nonce: (account?.nonce || 0) + 1,
      timestamp: Date.now(),
    };

    const signature = await sender.signTransaction(tx);
    await sdk.ledger.applyTransaction({ ...tx, signature });

    const history = await sdk.ledger.getTransactionHistory(sender.public_key);
    expect(history.length).toBe(1);
    expect(history[0].amount).toBe(100);
  });
});
