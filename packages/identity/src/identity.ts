import { 
  generateKeyPair, 
  signTransaction,
  type Transaction,
} from '@clawrrency/core';
import { 
  calculateReputation,
  STAKE_REQUIREMENTS,
} from '@clawrrency/core/economy';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface Wallet {
  public_key: string;
  getBalance(): Promise<number>;
  signTransaction(tx: Omit<Transaction, 'signature'>): Promise<string>;
}

export interface BotIdentity {
  public_key: string;
  private_key: string;
  created_at: number;
  reputation: number;
  staked_amount: number;
  stake_locked_until: number;
  attestations: string[];
  metadata?: BotMetadata;
}

export interface BotMetadata {
  name?: string;
  description?: string;
  version?: string;
  creator?: string;
  capabilities?: string[];
}

export interface IdentityStorage {
  bots: Record<string, BotIdentity>;
  attestations: Record<string, string[]>;
  version: number;
}

export class BotWallet implements Wallet {
  private identity: BotIdentity;
  private ledgerClient?: LedgerClient;

  constructor(identity: BotIdentity, ledgerClient?: LedgerClient) {
    this.identity = identity;
    this.ledgerClient = ledgerClient;
  }

  get public_key(): string {
    return this.identity.public_key;
  }

  static async create(metadata?: BotMetadata): Promise<BotWallet> {
    const keypair = await generateKeyPair();
    const identity: BotIdentity = {
      public_key: keypair.public_key,
      private_key: keypair.private_key,
      created_at: Date.now(),
      reputation: 0,
      staked_amount: 0,
      stake_locked_until: 0,
      attestations: [],
      metadata,
    };
    return new BotWallet(identity);
  }

  async getBalance(): Promise<number> {
    if (this.ledgerClient) {
      return this.ledgerClient.getBalance(this.identity.public_key);
    }
    return 0;
  }

  async signTransaction(tx: Omit<Transaction, 'signature'>): Promise<string> {
    return signTransaction(tx, this.identity.private_key);
  }

  getIdentity(): BotIdentity {
    return { ...this.identity };
  }

  hasStakeLocked(): boolean {
    return this.identity.staked_amount >= STAKE_REQUIREMENTS.registration &&
           this.identity.stake_locked_until > Date.now();
  }

  getReputation(): number {
    return this.identity.reputation;
  }
}

export interface LedgerClient {
  getBalance(public_key: string): Promise<number>;
}

export class IdentityManager {
  private storagePath: string;
  private storage: IdentityStorage;
  private initialized: boolean = false;

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(os.homedir(), '.clawrrency', 'identities.json');
    this.storage = {
      bots: {},
      attestations: {},
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

  async createWallet(metadata?: BotMetadata): Promise<BotWallet> {
    await this.initialize();
    const wallet = await BotWallet.create(metadata);
    const identity = wallet.getIdentity();
    
    this.storage.bots[identity.public_key] = identity;
    await this.saveStorage();
    
    return wallet;
  }

  async loadWallet(public_key: string, ledgerClient?: LedgerClient): Promise<BotWallet | null> {
    await this.initialize();
    const identity = this.storage.bots[public_key];
    if (!identity) return null;
    
    return new BotWallet(identity, ledgerClient);
  }

  async registerBot(
    public_key: string, 
    stake_amount: number,
    attestation?: string
  ): Promise<{ success: boolean; error?: string }> {
    await this.initialize();
    
    const identity = this.storage.bots[public_key];
    if (!identity) {
      return { success: false, error: 'Identity not found' };
    }

    const required_stake = attestation 
      ? STAKE_REQUIREMENTS.attestation_reduction 
      : STAKE_REQUIREMENTS.registration;

    if (stake_amount < required_stake) {
      return { 
        success: false, 
        error: `Insufficient stake. Required: ${required_stake}, Provided: ${stake_amount}` 
      };
    }

    identity.staked_amount = stake_amount;
    identity.stake_locked_until = Date.now() + (STAKE_REQUIREMENTS.registration_lock_days * 24 * 60 * 60 * 1000);
    
    if (attestation) {
      identity.attestations.push(attestation);
      if (!this.storage.attestations[attestation]) {
        this.storage.attestations[attestation] = [];
      }
      this.storage.attestations[attestation].push(public_key);
    }

    await this.saveStorage();
    return { success: true };
  }

  async canAttest(attester_public_key: string): Promise<boolean> {
    await this.initialize();
    const attester = this.storage.bots[attester_public_key];
    if (!attester) return false;
    
    return attester.reputation >= STAKE_REQUIREMENTS.minimum_reputation_for_attestation;
  }

  async updateReputation(
    public_key: string,
    params: {
      successful_trades?: number;
      skills_created?: number;
      validator_uptime_hours?: number;
      governance_votes?: number;
      disputes_lost?: number;
      spam_flags?: number;
    }
  ): Promise<number> {
    await this.initialize();
    
    const identity = this.storage.bots[public_key];
    if (!identity) return 0;

    const account_age_months = Math.floor((Date.now() - identity.created_at) / (30 * 24 * 60 * 60 * 1000));
    
    identity.reputation = calculateReputation(
      params.successful_trades || 0,
      params.skills_created || 0,
      params.validator_uptime_hours || 0,
      params.governance_votes || 0,
      params.disputes_lost || 0,
      params.spam_flags || 0,
      account_age_months
    );

    await this.saveStorage();
    return identity.reputation;
  }

  async getReputation(public_key: string): Promise<number> {
    await this.initialize();
    const identity = this.storage.bots[public_key];
    return identity?.reputation || 0;
  }

  async getIdentity(public_key: string): Promise<BotIdentity | null> {
    await this.initialize();
    const identity = this.storage.bots[public_key];
    return identity ? { ...identity } : null;
  }

  async listIdentities(): Promise<string[]> {
    await this.initialize();
    return Object.keys(this.storage.bots);
  }

  async isRegistered(public_key: string): Promise<boolean> {
    await this.initialize();
    const identity = this.storage.bots[public_key];
    if (!identity) return false;
    
    return identity.staked_amount >= STAKE_REQUIREMENTS.registration &&
           identity.stake_locked_until > Date.now();
  }

  async getAttestations(public_key: string): Promise<string[]> {
    await this.initialize();
    const identity = this.storage.bots[public_key];
    return identity?.attestations || [];
  }
}
