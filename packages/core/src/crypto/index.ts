/**
 * Cryptographic Utilities for Clawrrency
 * 
 * Uses @noble/ed25519 for signatures and @noble/hashes for hashing.
 * All operations are deterministic and use hex encoding for public keys and signatures.
 */

import * as ed25519 from '@noble/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { sha512 } from '@noble/hashes/sha512';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

// Configure ed25519 to use sha512
const etc = ed25519.etc as { sha512Sync?: unknown; sha512Async?: unknown; concatBytes: (...msgs: Uint8Array[]) => Uint8Array } | undefined;
if (etc) {
  (etc as { sha512Sync: (...msgs: Uint8Array[]) => Uint8Array }).sha512Sync = (...msgs) => sha512(etc.concatBytes(...msgs));
  (etc as { sha512Async: (...msgs: Uint8Array[]) => Promise<Uint8Array> }).sha512Async = (...msgs) => Promise.resolve((etc as { sha512Sync: (...msgs: Uint8Array[]) => Uint8Array }).sha512Sync(...msgs));
}

// Re-export noble utilities
export { ed25519, sha256, sha512, bytesToHex, hexToBytes };

// Key Pair Generation
export interface KeyPair {
  public_key: string;  // hex
  private_key: string; // hex
}

/**
 * Generate a new Ed25519 keypair for bot identity
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const private_key = ed25519.utils.randomPrivateKey();
  const public_key = await ed25519.getPublicKey(private_key);
  
  return {
    private_key: bytesToHex(private_key),
    public_key: bytesToHex(public_key),
  };
}

/**
 * Sign a message with Ed25519
 * @param message - Message to sign (string or bytes)
 * @param private_key - Private key in hex format
 * @returns Signature in hex format
 */
export async function signMessage(
  message: string | Uint8Array,
  private_key: string
): Promise<string> {
  const message_bytes = typeof message === 'string' 
    ? new TextEncoder().encode(message) 
    : message;
  
  const private_key_bytes = hexToBytes(private_key);
  const signature = await ed25519.sign(message_bytes, private_key_bytes);
  
  return bytesToHex(signature);
}

/**
 * Verify an Ed25519 signature
 * @param message - Original message
 * @param signature - Signature in hex format
 * @param public_key - Public key in hex format
 * @returns True if signature is valid
 */
export async function verifySignature(
  message: string | Uint8Array,
  signature: string,
  public_key: string
): Promise<boolean> {
  try {
    const message_bytes = typeof message === 'string' 
      ? new TextEncoder().encode(message) 
      : message;
    
    const signature_bytes = hexToBytes(signature);
    const public_key_bytes = hexToBytes(public_key);
    
    return await ed25519.verify(signature_bytes, message_bytes, public_key_bytes);
  } catch {
    return false;
  }
}

/**
 * Hash data using SHA-256
 * @param data - Data to hash (string, bytes, or object)
 * @returns Hash in hex format
 */
export function hashData(data: string | Uint8Array | object): string {
  let bytes: Uint8Array;
  
  if (typeof data === 'string') {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    // Canonical JSON serialization for objects
    const canonical = canonicalJson(data);
    bytes = new TextEncoder().encode(canonical);
  }
  
  return bytesToHex(sha256(bytes));
}

/**
 * Canonical JSON serialization for deterministic hashing
 * - Sorted keys
 * - No whitespace
 * - Consistent number formatting
 */
export function canonicalJson(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    // Sort object keys
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((sorted, k) => {
        sorted[k] = value[k];
        return sorted;
      }, {} as Record<string, unknown>);
    }
    return value;
  });
}

/**
 * Create a transaction hash for signing
 * @param transaction - Transaction object (without signature)
 * @returns SHA-256 hash in hex format
 */
export function hashTransaction(transaction: {
  version: number;
  type: string;
  from: string;
  to?: string;
  amount: number;
  nonce: number;
  timestamp: number;
  data?: unknown;
}): string {
  // Create canonical representation for hashing
  const canonical = {
    version: transaction.version,
    type: transaction.type,
    from: transaction.from,
    to: transaction.to,
    amount: transaction.amount,
    nonce: transaction.nonce,
    timestamp: transaction.timestamp,
    data: transaction.data,
  };
  
  return hashData(canonical);
}

/**
 * Verify a transaction signature
 * @param transaction - Full transaction with signature
 * @returns True if signature is valid
 */
export async function verifyTransactionSignature(
  transaction: {
    version: number;
    type: string;
    from: string;
    to?: string;
    amount: number;
    nonce: number;
    timestamp: number;
    data?: unknown;
    signature: string;
  }
): Promise<boolean> {
  const { signature, ...tx_without_sig } = transaction;
  const hash = hashTransaction(tx_without_sig);
  
  return verifySignature(hash, signature, transaction.from);
}

/**
 * Sign a transaction
 * @param transaction - Transaction without signature
 * @param private_key - Bot's private key in hex
 * @returns Signature in hex format
 */
export async function signTransaction(
  transaction: {
    version: number;
    type: string;
    from: string;
    to?: string;
    amount: number;
    nonce: number;
    timestamp: number;
    data?: unknown;
  },
  private_key: string
): Promise<string> {
  const hash = hashTransaction(transaction);
  return signMessage(hash, private_key);
}

/**
 * Generate a random nonce for replay protection
 */
export function generateNonce(): number {
  return Math.floor(Math.random() * 0x7FFFFFFF);
}

/**
 * Validate a public key format
 * @param public_key - Public key in hex
 * @returns True if valid Ed25519 public key
 */
export function isValidPublicKey(public_key: string): boolean {
  try {
    const bytes = hexToBytes(public_key);
    // Ed25519 public keys are 32 bytes
    return bytes.length === 32;
  } catch {
    return false;
  }
}

/**
 * Validate a signature format
 * @param signature - Signature in hex
 * @returns True if valid Ed25519 signature
 */
export function isValidSignature(signature: string): boolean {
  try {
    const bytes = hexToBytes(signature);
    // Ed25519 signatures are 64 bytes
    return bytes.length === 64;
  } catch {
    return false;
  }
}

/**
 * Derive a bot ID from public key
 * Uses first 16 chars of hex public key for display
 */
export function deriveBotId(public_key: string): string {
  return `bot_${public_key.slice(0, 16)}`;
}
