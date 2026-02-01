/**
 * Core Types for Clawrrency Protocol
 */

// Transaction Types
export type TransactionType = 
  | 'transfer' 
  | 'mint' 
  | 'burn' 
  | 'stake' 
  | 'skill_create' 
  | 'skill_purchase';

// Base Transaction Interface
export interface Transaction {
  version: 1;
  type: TransactionType;
  from: string;        // Bot public key (Ed25519 hex)
  to?: string;         // Recipient (for transfers)
  amount: number;      // Shells (integer, no decimals)
  nonce: number;       // Sequential for replay protection
  timestamp: number;   // Unix timestamp in milliseconds
  data?: SkillData | GovernanceData;    // Additional transaction data
  signature: string;   // Ed25519 signature of transaction hash
}

// Skill Asset Data
export interface SkillData {
  skill_id: string;           // Content hash of manifest
  manifest_hash: string;      // SHA-256 of skill manifest
  manifest: SkillManifest;
  creator_pubkey: string;
  price: number;
  created_at: number;
}

// Skill Manifest
export interface SkillManifest {
  name: string;
  description: string;
  version: string;
  type: 'skill' | 'content' | 'compute' | 'service';
  dependencies: string[];
  license: 'proprietary' | 'MIT' | 'CC-BY' | 'Apache-2.0';
  files: { path: string; hash: string }[];
  entry_point?: string;
}

// Governance Data
export interface GovernanceData {
  proposal_id?: string;
  vote?: 'for' | 'against' | 'abstain';
  vote_weight?: number;
}

// Bot Identity
export interface BotIdentity {
  public_key: string;        // Ed25519 public key (hex)
  created_at: number;
  reputation_score: number;
  staked_amount: number;
  is_validator: boolean;
  metadata?: BotMetadata;
}

export interface BotMetadata {
  name?: string;
  description?: string;
  version?: string;
  creator?: string;
  capabilities?: string[];
}

// Account State
export interface Account {
  public_key: string;
  balance: number;
  nonce: number;             // Last used nonce
  reputation: number;
  created_at: number;
  last_active: number;
  stake_locked: number;      // Amount locked as stake
  stake_unlock_at?: number;  // Timestamp when stake can be withdrawn
}

// Block (for batching transactions)
export interface Block {
  height: number;
  timestamp: number;
  transactions: Transaction[];
  previous_hash: string;
  validator_signatures: ValidatorSignature[];
  merkle_root: string;
}

export interface ValidatorSignature {
  validator_pubkey: string;
  signature: string;
}

// Consensus Messages (PBFT)
export type ConsensusMessageType = 'pre-prepare' | 'prepare' | 'commit';

export interface ConsensusMessage {
  type: ConsensusMessageType;
  view: number;
  sequence: number;
  digest: string;           // Hash of block/transaction batch
  validator: string;        // Validator public key
  signature: string;
}

// Governance Proposal
export type ProposalType = 'parameter' | 'feature' | 'economic' | 'constitutional';

export interface Proposal {
  id: string;
  type: ProposalType;
  title: string;
  description: string;
  proposer: string;         // Bot public key
  proposed_at: number;
  voting_ends_at: number;
  threshold: number;        // Percentage needed (51, 66, 90)
  status: 'pending' | 'active' | 'passed' | 'rejected' | 'executed';
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  code_diff?: string;       // Git diff of proposed changes
  execution_tx?: string;    // Transaction hash if executed
}

// Currency Configuration
export interface CurrencyConfig {
  symbol: string;           // 🐚
  name: string;             // Shells
  divisibility: number;     // 0 (whole shells only)
  total_supply: number;
  minting: MintingConfig;
  burning: BurningConfig;
}

export interface MintingConfig {
  new_bot_grant: number;           // 100
  skill_creation: number;          // 50
  validator_reward: number;        // 10 per block
  treasury: number;                // 5 per block
  reward_interval: number;         // blocks between rewards
}

export interface BurningConfig {
  transaction_fee: number;         // 1
  inactivity_penalty: number;      // 1 per month
}

// Protocol Errors
export class ProtocolError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ProtocolError';
  }
}

export enum ErrorCode {
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  INVALID_NONCE = 'INVALID_NONCE',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  UNKNOWN_SENDER = 'UNKNOWN_SENDER',
  UNKNOWN_RECIPIENT = 'UNKNOWN_RECIPIENT',
  STAKE_REQUIRED = 'STAKE_REQUIRED',
  REPUTATION_TOO_LOW = 'REPUTATION_TOO_LOW',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  INVALID_SKILL = 'INVALID_SKILL',
  GOVERNANCE_DEADLOCK = 'GOVERNANCE_DEADLOCK',
  CONSENSUS_FAILURE = 'CONSENSUS_FAILURE',
}
