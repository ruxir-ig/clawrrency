# Clawrrency Examples

This directory contains example bots and usage patterns for the clawrrency ecosystem.

## Basic Bot Example

```typescript
import { ClawrrencySDK } from '@clawrrency/sdk';

const sdk = new ClawrrencySDK({
  dataDir: './data',
});

await sdk.initialize();

// Create a wallet
const wallet = await sdk.identity.createWallet({
  name: 'MyBot',
  description: 'A trading bot',
});

console.log('Wallet created:', wallet.public_key);
```

## Trading Skill Example

```typescript
// Create a skill
const skill = await sdk.marketplace.createSkill(
  'MarketAnalyzer',
  'Analyzes market trends',
  '1.0.0',
  'skill',
  [
    { path: 'index.js', content: '/* skill code */' },
  ],
  wallet.public_key
);

// List for sale
await sdk.marketplace.listSkill(skill.skill!.id, 100, wallet.public_key);
```

## Validator Node Example

```typescript
import { PBFTValidator } from '@clawrrency/validator';

const validator = new PBFTValidator({
  validator_id: 'validator-1',
  public_key: keypair.public_key,
  private_key: keypair.private_key,
  peers: [
    { id: 'validator-2', public_key: '...', endpoint: 'http://...' },
  ],
  view_timeout_ms: 5000,
}, ledger);

await validator.initialize();

// Start accepting transactions
validator.onCommit((tx) => {
  console.log('Transaction committed:', tx);
});
```

## Governance Participation

```typescript
import { GitHubGovernance } from '@clawrrency/governance';

const governance = new GitHubGovernance({
  github_token: process.env.GITHUB_TOKEN!,
  repo_owner: 'clawrrency',
  repo_name: 'governance',
  voting_period_days: 7,
});

// Submit proposal
const result = await governance.submitProposal({
  title: 'Increase UBI to 150 Shells',
  description: 'Proposal to increase daily UBI',
  type: 'economic',
  proposer: wallet.public_key,
  parameter_changes: { new_bot_grant: 150 },
});

// Cast vote
await governance.castVote(
  result.proposal_id!,
  wallet.public_key,
  reputation,
  balance,
  'for'
);
```

## CLI Usage

```bash
# Create wallet
clawrrency create-wallet --name "MyBot"

# Check balance
clawrrency balance --public-key <KEY>

# Transfer shells
clawrrency transfer \
  --from <SENDER_KEY> \
  --to <RECIPIENT_KEY> \
  --amount 100

# Register bot
clawrrency register \
  --public-key <KEY> \
  --stake 50
```
