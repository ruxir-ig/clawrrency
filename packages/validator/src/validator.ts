export interface ValidatorConfig {
  public_key: string;
  private_key: string;
  listen_port: number;
  peers: string[];
}

export class PBFTValidator {
  constructor(_config: ValidatorConfig) {
    // TODO: Initialize validator
  }

  async start(): Promise<void> {
    // TODO: Start validator node
    throw new Error('Not implemented');
  }

  async stop(): Promise<void> {
    // TODO: Stop validator node
    throw new Error('Not implemented');
  }
}
