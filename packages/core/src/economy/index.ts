/**
 * Economic Model for Clawrrency
 * 
 * Implements minting, burning, and monetary policy for Shells currency.
 */

import type { CurrencyConfig, MintingConfig, Account, Transaction } from '../types/index.js';

// Default Currency Configuration
export const DEFAULT_CURRENCY_CONFIG: CurrencyConfig = {
  symbol: '🐚',
  name: 'Shells',
  divisibility: 0,  // Whole shells only
  total_supply: 0,  // Dynamic
  minting: {
    new_bot_grant: 100,
    skill_creation: 50,
    validator_reward: 10,
    treasury: 5,
    reward_interval: 100,  // Every 100 blocks
  },
  burning: {
    transaction_fee: 1,
    inactivity_penalty: 1,
  },
};

// Stake Requirements
export const STAKE_REQUIREMENTS = {
  registration: 50,        // Shells required to register
  registration_lock_days: 30,  // Days before stake can be withdrawn
  attestation_reduction: 25,   // Reduced to 25 if attested
  minimum_reputation_for_attestation: 100,
};

// Voting Thresholds
export const VOTING_THRESHOLDS = {
  parameter: 51,      // Simple majority
  feature: 60,        // 60% approval
  economic: 66,       // 2/3 majority
  constitutional: 90, // 90% supermajority
};

// Reputation Formula Constants
export const REPUTATION_CONSTANTS = {
  trade_success_weight: 10,
  skill_creation_weight: 20,
  validator_uptime_weight: 0.1,  // Per hour
  governance_participation_weight: 5,
  dispute_lost_penalty: 50,
  spam_flag_penalty: 100,
  max_voting_power: 1000,
  reputation_decay_rate: 0.01,  // 1% per month
};

/**
 * Calculate reputation score for a bot
 */
export function calculateReputation(
  successful_trades: number,
  skills_created: number,
  validator_uptime_hours: number,
  governance_votes: number,
  disputes_lost: number,
  spam_flags: number,
  account_age_months: number
): number {
  const { 
    trade_success_weight, 
    skill_creation_weight, 
    validator_uptime_weight,
    governance_participation_weight,
    dispute_lost_penalty,
    spam_flag_penalty,
    reputation_decay_rate,
  } = REPUTATION_CONSTANTS;

  let reputation = 
    (successful_trades * trade_success_weight) +
    (skills_created * skill_creation_weight) +
    (validator_uptime_hours * validator_uptime_weight) +
    (governance_votes * governance_participation_weight) -
    (disputes_lost * dispute_lost_penalty) -
    (spam_flags * spam_flag_penalty);

  // Apply decay based on account age
  reputation = reputation * Math.pow(1 - reputation_decay_rate, account_age_months);

  // Minimum reputation is 0
  return Math.max(0, reputation);
}

/**
 * Calculate voting power from reputation and holdings
 */
export function calculateVotingPower(
  reputation: number,
  shells_held: number
): number {
  const { max_voting_power } = REPUTATION_CONSTANTS;
  
  // Formula: min((rep × 0.5) + (shells × 0.001), 1000)
  const power = (reputation * 0.5) + (shells_held * 0.001);
  
  return Math.min(power, max_voting_power);
}

/**
 * Calculate minting amount for a new bot registration
 */
export function calculateRegistrationMint(
  has_attestation: boolean,
  config: MintingConfig = DEFAULT_CURRENCY_CONFIG.minting
): number {
  if (has_attestation) {
    // Attested bots get full UBI
    return config.new_bot_grant;
  }
  // Non-attested bots get reduced UBI until attested
  return config.new_bot_grant / 2;
}

/**
 * Calculate transaction fee
 */
export function calculateTransactionFee(
  base_fee: number = DEFAULT_CURRENCY_CONFIG.burning.transaction_fee,
  priority: 'low' | 'normal' | 'high' = 'normal'
): number {
  const multipliers = {
    low: 0.5,
    normal: 1,
    high: 2,
  };
  
  return Math.ceil(base_fee * multipliers[priority]);
}

/**
 * Calculate inflation rate based on economic activity
 */
export function calculateInflationRate(
  total_supply: number,
  minted_last_period: number,
  burned_last_period: number,
  period_days: number = 30
): number {
  const net_mint = minted_last_period - burned_last_period;
  const rate = (net_mint / total_supply) * (365 / period_days);
  
  return rate;  // Annualized inflation rate
}

/**
 * Check if an account is eligible for UBI
 */
export function isEligibleForUBI(
  account: Account,
  current_time: number
): boolean {
  // Must have stake locked for required period
  if (account.stake_locked < STAKE_REQUIREMENTS.registration) {
    return false;
  }
  
  // Stake must be locked for minimum period
  if (account.stake_unlock_at && account.stake_unlock_at > current_time) {
    return true;
  }
  
  // If stake unlock time has passed, not eligible
  return false;
}

/**
 * Calculate validator reward distribution
 */
export function calculateValidatorRewards(
  validator_pubkeys: string[],
  participation_scores: Map<string, number>,  // 0-1 score per validator
  total_reward: number = DEFAULT_CURRENCY_CONFIG.minting.validator_reward
): Map<string, number> {
  const rewards = new Map<string, number>();
  
  let total_participation = 0;
  for (const score of participation_scores.values()) {
    total_participation += score;
  }
  
  if (total_participation === 0) {
    // Equal distribution if no participation data
    const equal_share = total_reward / validator_pubkeys.length;
    for (const pubkey of validator_pubkeys) {
      rewards.set(pubkey, equal_share);
    }
  } else {
    // Proportional to participation
    for (const pubkey of validator_pubkeys) {
      const score = participation_scores.get(pubkey) || 0;
      const reward = (score / total_participation) * total_reward;
      rewards.set(pubkey, reward);
    }
  }
  
  return rewards;
}

/**
 * Validate economic constraints for a transaction
 */
export function validateEconomicConstraints(
  transaction: Transaction,
  sender_balance: number,
  _current_supply?: number
): { valid: boolean; error?: string } {
  // _current_supply reserved for future economic validations
  // Check for integer overflow
  if (transaction.amount > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: 'Amount too large' };
  }
  
  // Check for negative amount
  if (transaction.amount < 0) {
    return { valid: false, error: 'Negative amount not allowed' };
  }
  
  // Check for dust transactions (below minimum)
  if (transaction.amount === 0 && transaction.type === 'transfer') {
    return { valid: false, error: 'Zero amount transfer not allowed' };
  }
  
  // Check sender has enough for amount + fee
  const total_cost = transaction.amount + DEFAULT_CURRENCY_CONFIG.burning.transaction_fee;
  if (sender_balance < total_cost) {
    return { valid: false, error: 'Insufficient balance' };
  }
  
  return { valid: true };
}

/**
 * Calculate skill creation cost (minting reward vs validation cost)
 */
export function calculateSkillEconomics(
  skill_size_bytes: number,
  validation_complexity: 'low' | 'medium' | 'high'
): { 
  minting_reward: number;
  validation_cost: number;
  net_value: number;
} {
  const base_reward = DEFAULT_CURRENCY_CONFIG.minting.skill_creation;
  
  // Size penalty for very large skills
  const size_penalty = Math.floor(skill_size_bytes / 10000);  // -1 per 10KB
  
  // Validation cost based on complexity
  const validation_costs = {
    low: 1,
    medium: 5,
    high: 10,
  };
  
  const minting_reward = Math.max(0, base_reward - size_penalty);
  const validation_cost = validation_costs[validation_complexity];
  
  return {
    minting_reward,
    validation_cost,
    net_value: minting_reward - validation_cost,
  };
}
