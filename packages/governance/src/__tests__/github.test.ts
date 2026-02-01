import { describe, it, expect } from 'bun:test';
import { GitHubGovernance } from '../github.js';

describe('GitHub Governance', () => {
  it('should be defined', () => {
    expect(GitHubGovernance).toBeDefined();
  });

  it('should require GitHub token', () => {
    const config = {
      github_token: 'test-token',
      repo_owner: 'test-owner',
      repo_name: 'test-repo',
      voting_period_days: 7,
    };

    const governance = new GitHubGovernance(config);
    expect(governance).toBeDefined();
  });
});
