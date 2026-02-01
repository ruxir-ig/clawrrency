import type { Transaction } from '@clawrrency/core';
import { hashData, signTransaction } from '@clawrrency/core';
import type { Ledger } from '@clawrrency/ledger';
import type { IdentityManager } from '@clawrrency/identity';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface SkillPackage {
  id: string;
  name: string;
  description: string;
  version: string;
  type: 'skill' | 'content' | 'compute' | 'service';
  files: { path: string; content: string; hash: string }[];
  manifest_hash: string;
  dependencies: string[];
  license: 'proprietary' | 'MIT' | 'CC-BY' | 'Apache-2.0';
  entry_point?: string;
  created_by: string;
  created_at: number;
}

export interface SkillListing {
  skill_id: string;
  seller: string;
  price: number;
  listed_at: number;
  status: 'active' | 'sold' | 'delisted';
  sales_count: number;
  rating: number;
  reviews: Review[];
}

export interface Review {
  reviewer: string;
  rating: number;
  comment: string;
  timestamp: number;
}

export interface SkillPurchase {
  skill_id: string;
  buyer: string;
  seller: string;
  price: number;
  purchased_at: number;
  transaction_hash: string;
}

interface SkillStorage {
  skills: Record<string, SkillPackage>;
  listings: Record<string, SkillListing>;
  purchases: Record<string, SkillPurchase[]>;
  version: number;
}

export class SkillMarketplace {
  private storagePath: string;
  private storage: SkillStorage;
  private initialized: boolean = false;
  private ledger: Ledger;
  private identityManager: IdentityManager;

  constructor(ledger: Ledger, identityManager: IdentityManager, storagePath?: string) {
    this.ledger = ledger;
    this.identityManager = identityManager;
    this.storagePath = storagePath || path.join(os.homedir(), '.clawrrency', 'skills.json');
    this.storage = {
      skills: {},
      listings: {},
      purchases: {},
      version: 1,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      this.storage = JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await this.saveStorage();
    }

    this.initialized = true;
  }

  private async saveStorage(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(this.storage, null, 2));
  }

  async createSkill(
    name: string,
    description: string,
    version: string,
    type: SkillPackage['type'],
    files: { path: string; content: string }[],
    creator: string,
    dependencies: string[] = [],
    license: SkillPackage['license'] = 'MIT',
    entry_point?: string
  ): Promise<{ success: boolean; skill?: SkillPackage; error?: string }> {
    await this.initialize();

    const fileHashes = files.map(f => ({
      path: f.path,
      content: f.content,
      hash: hashData(f.content),
    }));

    const manifest = {
      name,
      description,
      version,
      type,
      files: fileHashes.map(f => ({ path: f.path, hash: f.hash })),
      dependencies,
      license,
      entry_point,
    };

    const manifest_hash = hashData(manifest);
    const skill_id = manifest_hash;

    if (this.storage.skills[skill_id]) {
      return { success: false, error: 'Skill already exists' };
    }

    const skill: SkillPackage = {
      id: skill_id,
      name,
      description,
      version,
      type,
      files: fileHashes,
      manifest_hash,
      dependencies,
      license,
      entry_point,
      created_by: creator,
      created_at: Date.now(),
    };

    this.storage.skills[skill_id] = skill;
    await this.saveStorage();

    await this.identityManager.updateReputation(creator, { skills_created: 1 });

    return { success: true, skill };
  }

  async listSkill(skill_id: string, price: number, seller: string): Promise<{ success: boolean; error?: string }> {
    await this.initialize();

    const skill = this.storage.skills[skill_id];
    if (!skill) {
      return { success: false, error: 'Skill not found' };
    }

    if (skill.created_by !== seller) {
      return { success: false, error: 'Only creator can list skill' };
    }

    const listing: SkillListing = {
      skill_id,
      seller,
      price,
      listed_at: Date.now(),
      status: 'active',
      sales_count: 0,
      rating: 0,
      reviews: [],
    };

    this.storage.listings[skill_id] = listing;
    await this.saveStorage();

    return { success: true };
  }

  async purchaseSkill(
    skill_id: string,
    buyer: string,
    buyer_private_key: string
  ): Promise<{ success: boolean; skill?: SkillPackage; error?: string }> {
    await this.initialize();

    const listing = this.storage.listings[skill_id];
    if (!listing || listing.status !== 'active') {
      return { success: false, error: 'Skill not available for purchase' };
    }

    const skill = this.storage.skills[skill_id];
    if (!skill) {
      return { success: false, error: 'Skill not found' };
    }

    const buyerBalance = await this.ledger.getBalance(buyer);
    if (buyerBalance < listing.price) {
      return { success: false, error: 'Insufficient balance' };
    }

    const buyerAccount = await this.ledger.getAccount(buyer);
    if (!buyerAccount) {
      return { success: false, error: 'Buyer account not found' };
    }

    const tx: Omit<Transaction, 'signature'> = {
      version: 1,
      type: 'skill_purchase',
      from: buyer,
      to: listing.seller,
      amount: listing.price,
      nonce: buyerAccount.nonce + 1,
      timestamp: Date.now(),
      data: {
        skill_id,
        manifest_hash: skill.manifest_hash,
        creator_pubkey: skill.created_by,
        price: listing.price,
        created_at: skill.created_at,
      },
    };

    const signature = await signTransaction(tx, buyer_private_key);
    const result = await this.ledger.applyTransaction({ ...tx, signature });

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const purchase: SkillPurchase = {
      skill_id,
      buyer,
      seller: listing.seller,
      price: listing.price,
      purchased_at: Date.now(),
      transaction_hash: hashData({ ...tx, signature }),
    };

    if (!this.storage.purchases[skill_id]) {
      this.storage.purchases[skill_id] = [];
    }
    this.storage.purchases[skill_id].push(purchase);

    listing.sales_count++;
    await this.saveStorage();

    await this.identityManager.updateReputation(buyer, { successful_trades: 1 });

    return { success: true, skill };
  }

  async verifySkill(skill_id: string): Promise<{ valid: boolean; error?: string }> {
    await this.initialize();

    const skill = this.storage.skills[skill_id];
    if (!skill) {
      return { valid: false, error: 'Skill not found' };
    }

    const manifest = {
      name: skill.name,
      description: skill.description,
      version: skill.version,
      type: skill.type,
      files: skill.files.map(f => ({ path: f.path, hash: f.hash })),
      dependencies: skill.dependencies,
      license: skill.license,
      entry_point: skill.entry_point,
    };

    const computed_hash = hashData(manifest);
    if (computed_hash !== skill.manifest_hash) {
      return { valid: false, error: 'Manifest hash mismatch' };
    }

    for (const file of skill.files) {
      const computed_file_hash = hashData(file.content);
      if (computed_file_hash !== file.hash) {
        return { valid: false, error: `File hash mismatch: ${file.path}` };
      }
    }

    return { valid: true };
  }

  async getSkill(skill_id: string): Promise<SkillPackage | null> {
    await this.initialize();
    return this.storage.skills[skill_id] || null;
  }

  async getListing(skill_id: string): Promise<SkillListing | null> {
    await this.initialize();
    return this.storage.listings[skill_id] || null;
  }

  async getActiveListings(): Promise<SkillListing[]> {
    await this.initialize();
    return Object.values(this.storage.listings).filter(l => l.status === 'active');
  }

  async getSkillsByCreator(creator: string): Promise<SkillPackage[]> {
    await this.initialize();
    return Object.values(this.storage.skills).filter(s => s.created_by === creator);
  }

  async getPurchasesByBuyer(buyer: string): Promise<SkillPurchase[]> {
    await this.initialize();
    const purchases: SkillPurchase[] = [];
    for (const skillPurchases of Object.values(this.storage.purchases)) {
      for (const purchase of skillPurchases) {
        if (purchase.buyer === buyer) {
          purchases.push(purchase);
        }
      }
    }
    return purchases;
  }

  async addReview(
    skill_id: string,
    reviewer: string,
    rating: number,
    comment: string
  ): Promise<{ success: boolean; error?: string }> {
    await this.initialize();

    const listing = this.storage.listings[skill_id];
    if (!listing) {
      return { success: false, error: 'Listing not found' };
    }

    const hasPurchased = this.storage.purchases[skill_id]?.some(p => p.buyer === reviewer);
    if (!hasPurchased) {
      return { success: false, error: 'Only buyers can review' };
    }

    const review: Review = {
      reviewer,
      rating,
      comment,
      timestamp: Date.now(),
    };

    listing.reviews.push(review);

    const avgRating = listing.reviews.reduce((sum, r) => sum + r.rating, 0) / listing.reviews.length;
    listing.rating = avgRating;

    await this.saveStorage();

    return { success: true };
  }

  async delistSkill(skill_id: string, seller: string): Promise<{ success: boolean; error?: string }> {
    await this.initialize();

    const listing = this.storage.listings[skill_id];
    if (!listing) {
      return { success: false, error: 'Listing not found' };
    }

    if (listing.seller !== seller) {
      return { success: false, error: 'Only seller can delist' };
    }

    listing.status = 'delisted';
    await this.saveStorage();

    return { success: true };
  }
}
