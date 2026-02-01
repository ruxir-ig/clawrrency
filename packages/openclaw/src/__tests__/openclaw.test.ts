import { describe, it, expect, beforeEach } from 'bun:test';
import { SkillMarketplace } from '../openclaw.js';
import { InMemoryLedger } from '@clawrrency/ledger';
import { IdentityManager } from '@clawrrency/identity';
import { generateKeyPair } from '@clawrrency/core';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Skill Marketplace', () => {
  let marketplace: SkillMarketplace;
  let ledger: InMemoryLedger;
  let identityManager: IdentityManager;
  let tempDir: string;
  let creator: { public_key: string; private_key: string };
  let buyer: { public_key: string; private_key: string };

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `clawrrency-skill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    
    const ledgerPath = path.join(tempDir, 'ledger.json');
    const identityPath = path.join(tempDir, 'identities.json');
    const skillPath = path.join(tempDir, 'skills.json');
    
    ledger = new InMemoryLedger(ledgerPath);
    identityManager = new IdentityManager(identityPath);
    marketplace = new SkillMarketplace(ledger, identityManager, skillPath);
    
    await ledger.initialize();
    await identityManager.initialize();
    await marketplace.initialize();

    creator = await generateKeyPair();
    buyer = await generateKeyPair();

    await ledger.createAccount(creator.public_key, 0);
    await ledger.createAccount(buyer.public_key, 1000);
    await identityManager.createWallet();
    await identityManager.createWallet();
  });

  describe('Skill Creation', () => {
    it('should create skills', async () => {
      const result = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      expect(result.success).toBe(true);
      expect(result.skill).toBeDefined();
      expect(result.skill?.name).toBe('TestSkill');
    });

    it('should prevent duplicate skills', async () => {
      await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      const result = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      expect(result.success).toBe(false);
    });

    it('should calculate manifest hashes', async () => {
      const result = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      expect(result.skill?.manifest_hash).toBeDefined();
      expect(result.skill?.manifest_hash.length).toBe(64);
    });
  });

  describe('Skill Listing', () => {
    it('should list skills for sale', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      const listResult = await marketplace.listSkill(skillResult.skill!.id, 100, creator.public_key);
      expect(listResult.success).toBe(true);
    });

    it('should only allow creator to list', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      const listResult = await marketplace.listSkill(skillResult.skill!.id, 100, buyer.public_key);
      expect(listResult.success).toBe(false);
    });

    it('should retrieve active listings', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      await marketplace.listSkill(skillResult.skill!.id, 100, creator.public_key);

      const listings = await marketplace.getActiveListings();
      expect(listings.length).toBe(1);
      expect(listings[0].price).toBe(100);
    });
  });

  describe('Skill Purchase', () => {
    it('should purchase skills', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      await marketplace.listSkill(skillResult.skill!.id, 50, creator.public_key);

      const purchaseResult = await marketplace.purchaseSkill(
        skillResult.skill!.id,
        buyer.public_key,
        buyer.private_key
      );

      expect(purchaseResult.success).toBe(true);
    });

    it('should reject purchases with insufficient balance', async () => {
      const poorBuyer = await generateKeyPair();
      await ledger.createAccount(poorBuyer.public_key, 10);

      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      await marketplace.listSkill(skillResult.skill!.id, 100, creator.public_key);

      const purchaseResult = await marketplace.purchaseSkill(
        skillResult.skill!.id,
        poorBuyer.public_key,
        poorBuyer.private_key
      );

      expect(purchaseResult.success).toBe(false);
    });

    it('should track purchases', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      await marketplace.listSkill(skillResult.skill!.id, 50, creator.public_key);

      await marketplace.purchaseSkill(skillResult.skill!.id, buyer.public_key, buyer.private_key);

      const purchases = await marketplace.getPurchasesByBuyer(buyer.public_key);
      expect(purchases.length).toBe(1);
    });
  });

  describe('Skill Verification', () => {
    it('should verify valid skills', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      const verifyResult = await marketplace.verifySkill(skillResult.skill!.id);
      expect(verifyResult.valid).toBe(true);
    });

    it('should detect tampered skills', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      skillResult.skill!.files[0].content = 'tampered content';

      const verifyResult = await marketplace.verifySkill(skillResult.skill!.id);
      expect(verifyResult.valid).toBe(false);
    });
  });

  describe('Reviews', () => {
    it('should allow buyers to review', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      await marketplace.listSkill(skillResult.skill!.id, 50, creator.public_key);
      await marketplace.purchaseSkill(skillResult.skill!.id, buyer.public_key, buyer.private_key);

      const reviewResult = await marketplace.addReview(
        skillResult.skill!.id,
        buyer.public_key,
        5,
        'Great skill!'
      );

      expect(reviewResult.success).toBe(true);
    });

    it('should calculate average ratings', async () => {
      const skillResult = await marketplace.createSkill(
        'TestSkill',
        'A test skill',
        '1.0.0',
        'skill',
        [{ path: 'index.js', content: 'module.exports = {};' }],
        creator.public_key
      );

      await marketplace.listSkill(skillResult.skill!.id, 50, creator.public_key);
      await marketplace.purchaseSkill(skillResult.skill!.id, buyer.public_key, buyer.private_key);

      await marketplace.addReview(skillResult.skill!.id, buyer.public_key, 4, 'Good');

      const listing = await marketplace.getListing(skillResult.skill!.id);
      expect(listing?.rating).toBe(4);
    });
  });
});
