export interface SDKConfig {
  validator_endpoint: string;
  bot_private_key: string;
}

export class ClawrrencySDK {
  constructor(_config: SDKConfig) {
    // TODO: Initialize SDK
  }

  async getBalance(_public_key: string): Promise<number> {
    // TODO: Query balance
    return 0;
  }

  async transfer(_to: string, _amount: number): Promise<string> {
    // TODO: Submit transfer transaction
    throw new Error('Not implemented');
  }

  async createSkill(_skill: unknown): Promise<string> {
    // TODO: Create skill
    throw new Error('Not implemented');
  }
}
