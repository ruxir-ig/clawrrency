import { IdentityManager } from '@clawrrency/identity';
import { InMemoryLedger } from '@clawrrency/ledger';
import { SkillMarketplace } from '@clawrrency/openclaw';
import { GitHubGovernance } from '@clawrrency/governance';
import { PBFTValidator } from '@clawrrency/validator';

export class ClawrrencySDK {
  identity: IdentityManager;
  ledger: InMemoryLedger;
  marketplace: SkillMarketplace;
  governance?: GitHubGovernance;
  validator?: PBFTValidator;

  constructor(config: {
    dataDir: string;
    githubToken?: string;
    repoOwner?: string;
    repoName?: string;
  }) {
    this.identity = new IdentityManager(`${config.dataDir}/identities.json`);
    this.ledger = new InMemoryLedger(`${config.dataDir}/ledger.json`);
    this.marketplace = new SkillMarketplace(
      this.ledger,
      this.identity,
      `${config.dataDir}/skills.json`
    );

    if (config.githubToken && config.repoOwner && config.repoName) {
      this.governance = new GitHubGovernance({
        github_token: config.githubToken,
        repo_owner: config.repoOwner,
        repo_name: config.repoName,
        voting_period_days: 7,
      });
    }
  }

  async initialize(): Promise<void> {
    await this.identity.initialize();
    await this.ledger.initialize();
    await this.marketplace.initialize();
  }
}

export type { Transaction, Account, Proposal, ProposalType } from '@clawrrency/core';
export { BotWallet, IdentityManager } from '@clawrrency/identity';
export { InMemoryLedger } from '@clawrrency/ledger';
export { SkillMarketplace, SkillPackage } from '@clawrrency/openclaw';
export { GitHubGovernance } from '@clawrrency/governance';
export { PBFTValidator } from '@clawrrency/validator';
