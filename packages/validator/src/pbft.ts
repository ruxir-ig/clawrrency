import type { Transaction, ConsensusMessage } from '@clawrrency/core';
import { hashTransaction, verifySignature } from '@clawrrency/core';
import type { Ledger } from '@clawrrency/ledger';

export interface ValidatorConfig {
  validator_id: string;
  public_key: string;
  private_key: string;
  peers: PeerInfo[];
  view_timeout_ms: number;
}

export interface PeerInfo {
  id: string;
  public_key: string;
  endpoint: string;
}

export interface PBFTState {
  view: number;
  sequence: number;
  is_leader: boolean;
  leader_id: string;
  prepared: Map<string, Set<string>>;
  committed: Map<string, Set<string>>;
  checkpoint: number;
}

export interface PendingTransaction {
  tx: Transaction;
  received_at: number;
  pre_prepared: boolean;
  prepared: boolean;
  committed: boolean;
}

export class PBFTValidator {
  private config: ValidatorConfig;
  private ledger: Ledger;
  private state: PBFTState;
  private pending: Map<string, PendingTransaction>;
  private message_log: ConsensusMessage[];
  private on_commit_callbacks: ((tx: Transaction) => void)[];

  constructor(config: ValidatorConfig, ledger: Ledger) {
    this.config = config;
    this.ledger = ledger;
    this.pending = new Map();
    this.message_log = [];
    this.on_commit_callbacks = [];

    const leader_id = this.electLeader(0);
    
    this.state = {
      view: 0,
      sequence: 0,
      is_leader: leader_id === config.validator_id,
      leader_id,
      prepared: new Map(),
      committed: new Map(),
      checkpoint: 0,
    };
  }

  private electLeader(view: number): string {
    if (this.config.peers.length === 0) {
      return this.config.validator_id;
    }
    const all_validators = [
      { id: this.config.validator_id, public_key: this.config.public_key },
      ...this.config.peers,
    ];
    const leader_index = view % all_validators.length;
    return all_validators[leader_index].id;
  }

  async initialize(): Promise<void> {
    await this.ledger.initialize();
  }

  isLeader(): boolean {
    return this.state.is_leader;
  }

  getLeaderId(): string {
    return this.state.leader_id;
  }

  getView(): number {
    return this.state.view;
  }

  getSequence(): number {
    return this.state.sequence;
  }

  onCommit(callback: (tx: Transaction) => void): void {
    this.on_commit_callbacks.push(callback);
  }

  async submitTransaction(tx: Transaction): Promise<{ success: boolean; error?: string }> {
    const tx_hash = hashTransaction(tx);

    if (this.pending.has(tx_hash)) {
      return { success: false, error: 'Transaction already pending' };
    }

    const validation = await this.validateTransaction(tx);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    this.pending.set(tx_hash, {
      tx,
      received_at: Date.now(),
      pre_prepared: false,
      prepared: false,
      committed: false,
    });

    if (this.state.is_leader) {
      await this.broadcastPrePrepare(tx_hash, tx);
    }

    return { success: true };
  }

  private async validateTransaction(tx: Transaction): Promise<{ valid: boolean; error?: string }> {
    const is_valid_sig = await verifySignature(
      hashTransaction(tx),
      tx.signature,
      tx.from
    );
    
    if (!is_valid_sig) {
      return { valid: false, error: 'Invalid signature' };
    }

    const account = await this.ledger.getAccount(tx.from);
    if (!account) {
      return { valid: false, error: 'Sender account not found' };
    }

    if (tx.nonce !== account.nonce + 1) {
      return { valid: false, error: `Invalid nonce. Expected: ${account.nonce + 1}` };
    }

    return { valid: true };
  }

  private async broadcastPrePrepare(tx_hash: string, tx: Transaction): Promise<void> {
    const message: ConsensusMessage = {
      type: 'pre-prepare',
      view: this.state.view,
      sequence: this.state.sequence++,
      digest: tx_hash,
      validator: this.config.validator_id,
      signature: '',
    };

    message.signature = await this.signMessage(JSON.stringify(message));
    
    this.message_log.push(message);
    
    await this.handlePrePrepare(message, tx);
  }

  async handlePrePrepare(message: ConsensusMessage, _tx: Transaction): Promise<void> {
    if (message.type !== 'pre-prepare') return;

    const is_valid = await this.verifyMessage(message);
    if (!is_valid) return;

    if (message.view !== this.state.view) return;

    const sender_is_leader = message.validator === this.state.leader_id;
    if (!sender_is_leader) return;

    const pending = this.pending.get(message.digest);
    if (!pending) return;

    pending.pre_prepared = true;

    await this.broadcastPrepare(message.digest);
  }

  private async broadcastPrepare(tx_hash: string): Promise<void> {
    const message: ConsensusMessage = {
      type: 'prepare',
      view: this.state.view,
      sequence: this.state.sequence,
      digest: tx_hash,
      validator: this.config.validator_id,
      signature: '',
    };

    message.signature = await this.signMessage(JSON.stringify(message));
    
    this.message_log.push(message);
    
    await this.handlePrepare(message);
  }

  async handlePrepare(message: ConsensusMessage): Promise<void> {
    if (message.type !== 'prepare') return;

    const is_valid = await this.verifyMessage(message);
    if (!is_valid) return;

    if (message.view !== this.state.view) return;

    const tx_hash = message.digest;
    
    if (!this.state.prepared.has(tx_hash)) {
      this.state.prepared.set(tx_hash, new Set());
    }
    
    this.state.prepared.get(tx_hash)!.add(message.validator);

    const all_validators = this.config.peers.length + 1;
    const f = Math.floor((all_validators - 1) / 3);
    const quorum = 2 * f + 1;

    const prepare_count = this.state.prepared.get(tx_hash)!.size + 1;
    
    if (prepare_count >= quorum) {
      const pending = this.pending.get(tx_hash);
      if (pending && !pending.prepared) {
        pending.prepared = true;
        await this.broadcastCommit(tx_hash);
      }
    }
  }

  private async broadcastCommit(tx_hash: string): Promise<void> {
    const message: ConsensusMessage = {
      type: 'commit',
      view: this.state.view,
      sequence: this.state.sequence,
      digest: tx_hash,
      validator: this.config.validator_id,
      signature: '',
    };

    message.signature = await this.signMessage(JSON.stringify(message));
    
    this.message_log.push(message);
    
    await this.handleCommit(message);
  }

  async handleCommit(message: ConsensusMessage): Promise<void> {
    if (message.type !== 'commit') return;

    const is_valid = await this.verifyMessage(message);
    if (!is_valid) return;

    if (message.view !== this.state.view) return;

    const tx_hash = message.digest;
    
    if (!this.state.committed.has(tx_hash)) {
      this.state.committed.set(tx_hash, new Set());
    }
    
    this.state.committed.get(tx_hash)!.add(message.validator);

    const all_validators = this.config.peers.length + 1;
    const f = Math.floor((all_validators - 1) / 3);
    const quorum = 2 * f + 1;

    const commit_count = this.state.committed.get(tx_hash)!.size + 1;
    
    if (commit_count >= quorum) {
      const pending = this.pending.get(tx_hash);
      if (pending && !pending.committed) {
        pending.committed = true;
        await this.commitTransaction(tx_hash, pending.tx);
      }
    }
  }

  private async commitTransaction(tx_hash: string, tx: Transaction): Promise<void> {
    const result = await this.ledger.applyTransaction(tx);
    
    if (result.success) {
      this.pending.delete(tx_hash);
      this.state.prepared.delete(tx_hash);
      this.state.committed.delete(tx_hash);
      
      for (const callback of this.on_commit_callbacks) {
        callback(tx);
      }
    }
  }

  private async signMessage(message: string): Promise<string> {
    const { signMessage } = await import('@clawrrency/core');
    return signMessage(message, this.config.private_key);
  }

  private async verifyMessage(message: ConsensusMessage): Promise<boolean> {
    const { verifySignature } = await import('@clawrrency/core');
    
    const msg_copy = { ...message };
    const signature = msg_copy.signature;
    msg_copy.signature = '';
    
    let public_key: string | undefined;
    
    if (message.validator === this.config.validator_id) {
      public_key = this.config.public_key;
    } else {
      const peer = this.config.peers.find(p => p.id === message.validator);
      public_key = peer?.public_key;
    }
    
    if (!public_key) return false;
    
    return verifySignature(JSON.stringify(msg_copy), signature, public_key);
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  getMessageLog(): ConsensusMessage[] {
    return [...this.message_log];
  }

  async getStatus(): Promise<{
    view: number;
    sequence: number;
    is_leader: boolean;
    leader_id: string;
    pending_count: number;
    block_height: number;
  }> {
    const block_height = await this.ledger.getBlockHeight();
    
    return {
      view: this.state.view,
      sequence: this.state.sequence,
      is_leader: this.state.is_leader,
      leader_id: this.state.leader_id,
      pending_count: this.pending.size,
      block_height,
    };
  }
}
