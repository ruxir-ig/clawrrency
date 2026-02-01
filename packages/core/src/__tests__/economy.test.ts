import { describe, it, expect } from 'bun:test';
import {
  calculateReputation,
  calculateVotingPower,
  calculateRegistrationMint,
  calculateTransactionFee,
  calculateInflationRate,
  isEligibleForUBI,
  calculateValidatorRewards,
  validateEconomicConstraints,
  calculateSkillEconomics,
  DEFAULT_CURRENCY_CONFIG,
  STAKE_REQUIREMENTS,
  REPUTATION_CONSTANTS,
} from '../economy/index.js';
import type { Account } from '../types/index.js';

describe('Economic Model', () => {
  describe('Reputation Calculation', () => {
    it('should calculate reputation from trades and skills', () => {
      const reputation = calculateReputation(
        10,    // successful_trades
        2,     // skills_created
        100,   // validator_uptime_hours
        5,     // governance_votes
        0,     // disputes_lost
        0,     // spam_flags
        6      // account_age_months
      );

      // Expected: (10*10) + (2*20) + (100*0.1) + (5*5) = 100 + 40 + 10 + 25 = 175
      // With 6 months decay at 1%: 175 * (0.99)^6 ≈ 165
      expect(reputation).toBeGreaterThan(0);
      expect(reputation).toBeLessThan(200);
    });

    it('should penalize disputes and spam', () => {
      const reputation = calculateReputation(
        10,    // successful_trades
        2,     // skills_created
        100,   // validator_uptime_hours
        5,     // governance_votes
        2,     // disputes_lost (penalty: -100)
        1,     // spam_flags (penalty: -100)
        1      // account_age_months
      );

      // High penalties should result in low or zero reputation
      expect(reputation).toBeLessThan(100);
    });

    it('should not allow negative reputation', () => {
      const reputation = calculateReputation(
        0,     // successful_trades
        0,     // skills_created
        0,     // validator_uptime_hours
        0,     // governance_votes
        10,    // disputes_lost (penalty: -500)
        5,     // spam_flags (penalty: -500)
        1      // account_age_months
      );

      expect(reputation).toBe(0);
    });
  });

  describe('Voting Power', () => {
    it('should calculate voting power from reputation and shells', () => {
      const power = calculateVotingPower(100, 1000);
      
      // Expected: min((100*0.5) + (1000*0.001), 1000) = min(51, 1000) = 51
      expect(power).toBe(51);
    });

    it('should cap voting power at maximum', () => {
      const power = calculateVotingPower(10000, 1000000);
      
      // Should be capped at 1000
      expect(power).toBe(1000);
    });

    it('should give some power to new bots', () => {
      const power = calculateVotingPower(10, 100);
      
      // Expected: (10*0.5) + (100*0.001) = 5.1
      expect(power).toBeGreaterThan(0);
      expect(power).toBeLessThan(20);
    });
  });

  describe('Registration Mint', () => {
    it('should give full UBI to attested bots', () => {
      const mint = calculateRegistrationMint(true);
      
      expect(mint).toBe(DEFAULT_CURRENCY_CONFIG.minting.new_bot_grant);
    });

    it('should give reduced UBI to unattested bots', () => {
      const mint = calculateRegistrationMint(false);
      
      expect(mint).toBe(DEFAULT_CURRENCY_CONFIG.minting.new_bot_grant / 2);
    });
  });

  describe('Transaction Fees', () => {
    it('should calculate normal priority fee', () => {
      const fee = calculateTransactionFee(1, 'normal');
      expect(fee).toBe(1);
    });

    it('should calculate high priority fee', () => {
      const fee = calculateTransactionFee(1, 'high');
      expect(fee).toBe(2);
    });

    it('should calculate low priority fee', () => {
      const fee = calculateTransactionFee(1, 'low');
      expect(fee).toBe(1); // 0.5 rounded up to 1
    });
  });

  describe('Inflation Rate', () => {
    it('should calculate positive inflation', () => {
      const rate = calculateInflationRate(
        1000000,   // total_supply
        10000,     // minted_last_period
        1000,      // burned_last_period
        30         // period_days
      );
      
      // Net mint: 9000, rate: (9000/1000000) * (365/30) ≈ 1.095 = 109.5% annual
      expect(rate).toBeGreaterThan(0);
    });

    it('should calculate negative inflation (deflation)', () => {
      const rate = calculateInflationRate(
        1000000,   // total_supply
        1000,      // minted_last_period
        10000,     // burned_last_period
        30         // period_days
      );
      
      // Net mint: -9000, should be negative
      expect(rate).toBeLessThan(0);
    });
  });

  describe('UBI Eligibility', () => {
    it('should be eligible with sufficient stake', () => {
      const account: Account = {
        public_key: 'abc123',
        balance: 150,
        nonce: 0,
        reputation: 0,
        created_at: Date.now() - 86400000 * 60, // 60 days ago
        last_active: Date.now(),
        stake_locked: STAKE_REQUIREMENTS.registration,
        stake_unlock_at: Date.now() + 86400000 * 30, // 30 days from now
      };

      const eligible = isEligibleForUBI(account, Date.now());
      expect(eligible).toBe(true);
    });

    it('should not be eligible without stake', () => {
      const account: Account = {
        public_key: 'abc123',
        balance: 100,
        nonce: 0,
        reputation: 0,
        created_at: Date.now(),
        last_active: Date.now(),
        stake_locked: 0,
      };

      const eligible = isEligibleForUBI(account, Date.now());
      expect(eligible).toBe(false);
    });

    it('should not be eligible after stake unlock', () => {
      const account: Account = {
        public_key: 'abc123',
        balance: 150,
        nonce: 0,
        reputation: 0,
        created_at: Date.now() - 86400000 * 60,
        last_active: Date.now(),
        stake_locked: STAKE_REQUIREMENTS.registration,
        stake_unlock_at: Date.now() - 86400000, // Already unlocked
      };

      const eligible = isEligibleForUBI(account, Date.now());
      expect(eligible).toBe(false);
    });
  });

  describe('Validator Rewards', () => {
    it('should distribute rewards equally when no participation data', () => {
      const validators = ['val1', 'val2', 'val3'];
      const participation = new Map<string, number>();
      
      const rewards = calculateValidatorRewards(validators, participation, 30);
      
      expect(rewards.get('val1')).toBe(10);
      expect(rewards.get('val2')).toBe(10);
      expect(rewards.get('val3')).toBe(10);
    });

    it('should distribute proportionally based on participation', () => {
      const validators = ['val1', 'val2'];
      const participation = new Map([
        ['val1', 0.8],
        ['val2', 0.2],
      ]);
      
      const rewards = calculateValidatorRewards(validators, participation, 100);
      
      expect(rewards.get('val1')).toBe(80);
      expect(rewards.get('val2')).toBe(20);
    });
  });

  describe('Transaction Validation', () => {
    it('should validate normal transactions', () => {
      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: 'sender',
        to: 'recipient',
        amount: 50,
        nonce: 1,
        timestamp: Date.now(),
        signature: 'valid_sig',
      };

      const result = validateEconomicConstraints(tx, 100);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject transactions with insufficient balance', () => {
      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: 'sender',
        to: 'recipient',
        amount: 100,
        nonce: 1,
        timestamp: Date.now(),
        signature: 'valid_sig',
      };

      const result = validateEconomicConstraints(tx, 50);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Insufficient balance');
    });

    it('should reject zero amount transfers', () => {
      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: 'sender',
        to: 'recipient',
        amount: 0,
        nonce: 1,
        timestamp: Date.now(),
        signature: 'valid_sig',
      };

      const result = validateEconomicConstraints(tx, 100);
      
      expect(result.valid).toBe(false);
    });
  });

  describe('Skill Economics', () => {
    it('should calculate skill creation economics', () => {
      const economics = calculateSkillEconomics(5000, 'medium');
      
      expect(economics.minting_reward).toBe(DEFAULT_CURRENCY_CONFIG.minting.skill_creation);
      expect(economics.validation_cost).toBe(5);
      expect(economics.net_value).toBe(45);
    });

    it('should penalize large skills', () => {
      const economics = calculateSkillEconomics(50000, 'low'); // 50KB
      
      // Size penalty: 50KB / 10KB = -5
      expect(economics.minting_reward).toBe(DEFAULT_CURRENCY_CONFIG.minting.skill_creation - 5);
    });
  });
});
