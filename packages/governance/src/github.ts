import { Octokit } from '@octokit/rest';
import type { Proposal, ProposalType } from '@clawrrency/core';
import { calculateVotingPower } from '@clawrrency/core/economy';

export interface GovernanceConfig {
  github_token: string;
  repo_owner: string;
  repo_name: string;
  voting_period_days: number;
}

export interface ProposalSubmission {
  title: string;
  description: string;
  type: ProposalType;
  proposer: string;
  code_changes?: string;
  parameter_changes?: Record<string, unknown>;
}

export interface Vote {
  proposal_id: string;
  voter: string;
  decision: 'for' | 'against' | 'abstain';
  voting_power: number;
  timestamp: number;
}

export class GitHubGovernance {
  private octokit: Octokit;
  private config: GovernanceConfig;

  constructor(config: GovernanceConfig) {
    this.config = config;
    this.octokit = new Octokit({ auth: config.github_token });
  }

  async submitProposal(proposal: ProposalSubmission): Promise<{ success: boolean; proposal_id?: string; error?: string }> {
    try {
      const title = `[${proposal.type.toUpperCase()}] ${proposal.title}`;
      const body = this.formatProposalBody(proposal);

      const { data: pr } = await this.octokit.pulls.create({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        title,
        body,
        head: `proposal/${Date.now()}`,
        base: 'main',
      });

      await this.octokit.issues.addLabels({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        issue_number: pr.number,
        labels: ['governance', proposal.type],
      });

      return { success: true, proposal_id: pr.number.toString() };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private formatProposalBody(proposal: ProposalSubmission): string {
    let body = `## Proposal Details\n\n`;
    body += `**Type:** ${proposal.type}\n`;
    body += `**Proposer:** ${proposal.proposer}\n`;
    body += `**Submitted:** ${new Date().toISOString()}\n\n`;
    
    body += `## Description\n\n${proposal.description}\n\n`;

    if (proposal.parameter_changes) {
      body += `## Parameter Changes\n\n`;
      body += `\`\`\`json\n${JSON.stringify(proposal.parameter_changes, null, 2)}\n\`\`\`\n\n`;
    }

    if (proposal.code_changes) {
      body += `## Code Changes\n\n`;
      body += `See diff in PR files.\n\n`;
    }

    body += `## Voting\n\n`;
    body += `React with:\n`;
    body += `- 👍 (FOR)\n`;
    body += `- 👎 (AGAINST)\n`;
    body += `- 😕 (ABSTAIN)\n\n`;
    body += `Voting period: ${this.config.voting_period_days} days\n`;

    return body;
  }

  async getProposal(proposal_id: string): Promise<Proposal | null> {
    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        pull_number: parseInt(proposal_id),
      });

      const { data: reactions } = await this.octokit.reactions.listForIssue({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        issue_number: parseInt(proposal_id),
      });

      let votes_for = 0;
      let votes_against = 0;
      let votes_abstain = 0;

      for (const reaction of reactions) {
        if (reaction.content === '+1') votes_for++;
        if (reaction.content === '-1') votes_against++;
        if (reaction.content === 'confused') votes_abstain++;
      }

      return {
        id: proposal_id,
        type: this.extractProposalType(pr.title),
        title: pr.title,
        description: pr.body || '',
        proposer: pr.user?.login || 'unknown',
        proposed_at: new Date(pr.created_at).getTime(),
        voting_ends_at: new Date(pr.created_at).getTime() + (this.config.voting_period_days * 24 * 60 * 60 * 1000),
        threshold: this.getThresholdForType(this.extractProposalType(pr.title)),
        status: this.mapPRStateToStatus(pr.state, pr.merged),
        votes_for,
        votes_against,
        votes_abstain,
      };
    } catch {
      return null;
    }
  }

  private extractProposalType(title: string): ProposalType {
    const match = title.match(/^\[(\w+)\]/);
    if (match) {
      const type = match[1].toLowerCase();
      if (['parameter', 'feature', 'economic', 'constitutional'].includes(type)) {
        return type as ProposalType;
      }
    }
    return 'parameter';
  }

  private getThresholdForType(type: ProposalType): number {
    const thresholds = {
      parameter: 51,
      feature: 60,
      economic: 66,
      constitutional: 90,
    };
    return thresholds[type];
  }

  private mapPRStateToStatus(state: string, merged: boolean | null): Proposal['status'] {
    if (merged) return 'executed';
    if (state === 'closed') return 'rejected';
    return 'active';
  }

  async castVote(
    proposal_id: string,
    voter: string,
    reputation: number,
    shells_held: number,
    decision: 'for' | 'against' | 'abstain'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const voting_power = calculateVotingPower(reputation, shells_held);

      const reaction = decision === 'for' ? '+1' : decision === 'against' ? '-1' : 'confused';

      await this.octokit.reactions.createForIssue({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        issue_number: parseInt(proposal_id),
        content: reaction as '+1' | '-1' | 'confused',
      });

      const comment = `Vote cast by ${voter}\nVoting power: ${voting_power.toFixed(2)}\nDecision: ${decision}`;
      
      await this.octokit.issues.createComment({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        issue_number: parseInt(proposal_id),
        body: comment,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getActiveProposals(): Promise<Proposal[]> {
    try {
      const { data: pulls } = await this.octokit.pulls.list({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        state: 'open',
        labels: 'governance',
      });

      const proposals: Proposal[] = [];
      for (const pr of pulls) {
        const proposal = await this.getProposal(pr.number.toString());
        if (proposal) proposals.push(proposal);
      }

      return proposals;
    } catch {
      return [];
    }
  }

  async executeProposal(proposal_id: string, github_token?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const proposal = await this.getProposal(proposal_id);
      if (!proposal) {
        return { success: false, error: 'Proposal not found' };
      }

      if (proposal.status !== 'active') {
        return { success: false, error: 'Proposal is not active' };
      }

      const total_votes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain;
      if (total_votes === 0) {
        return { success: false, error: 'No votes cast' };
      }

      const for_percentage = (proposal.votes_for / total_votes) * 100;

      if (for_percentage < proposal.threshold) {
        await this.octokit.pulls.update({
          owner: this.config.repo_owner,
          repo: this.config.repo_name,
          pull_number: parseInt(proposal_id),
          state: 'closed',
        });
        return { success: false, error: `Threshold not met: ${for_percentage.toFixed(1)}% < ${proposal.threshold}%` };
      }

      const octokit = github_token ? new Octokit({ auth: github_token }) : this.octokit;

      await octokit.pulls.merge({
        owner: this.config.repo_owner,
        repo: this.config.repo_name,
        pull_number: parseInt(proposal_id),
        merge_method: 'squash',
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async getVotingResults(proposal_id: string): Promise<{
    total_votes: number;
    for_percentage: number;
    against_percentage: number;
    abstain_percentage: number;
    threshold_met: boolean;
  } | null> {
    const proposal = await this.getProposal(proposal_id);
    if (!proposal) return null;

    const total_votes = proposal.votes_for + proposal.votes_against + proposal.votes_abstain;
    if (total_votes === 0) {
      return {
        total_votes: 0,
        for_percentage: 0,
        against_percentage: 0,
        abstain_percentage: 0,
        threshold_met: false,
      };
    }

    const for_percentage = (proposal.votes_for / total_votes) * 100;
    const against_percentage = (proposal.votes_against / total_votes) * 100;
    const abstain_percentage = (proposal.votes_abstain / total_votes) * 100;

    return {
      total_votes,
      for_percentage,
      against_percentage,
      abstain_percentage,
      threshold_met: for_percentage >= proposal.threshold,
    };
  }
}
