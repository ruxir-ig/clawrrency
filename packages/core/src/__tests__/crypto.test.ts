import { describe, it, expect, beforeAll } from 'bun:test';
import {
  generateKeyPair,
  signMessage,
  verifySignature,
  hashData,
  hashTransaction,
  signTransaction,
  verifyTransactionSignature,
  canonicalJson,
  isValidPublicKey,
  isValidSignature,
  deriveBotId,
} from '../crypto/index.js';

describe('Cryptographic Primitives', () => {
  describe('Key Generation', () => {
    it('should generate valid Ed25519 keypairs', async () => {
      const keypair = await generateKeyPair();
      
      expect(keypair.public_key).toBeDefined();
      expect(keypair.private_key).toBeDefined();
      expect(keypair.public_key).toMatch(/^[0-9a-f]{64}$/);
      expect(keypair.private_key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique keypairs each time', async () => {
      const keypair1 = await generateKeyPair();
      const keypair2 = await generateKeyPair();
      
      expect(keypair1.public_key).not.toBe(keypair2.public_key);
      expect(keypair1.private_key).not.toBe(keypair2.private_key);
    });
  });

  describe('Signing and Verification', () => {
    let keypair: { public_key: string; private_key: string };

    beforeAll(async () => {
      keypair = await generateKeyPair();
    });

    it('should sign and verify messages', async () => {
      const message = 'Hello, clawrrency!';
      const signature = await signMessage(message, keypair.private_key);
      
      expect(signature).toBeDefined();
      expect(signature).toMatch(/^[0-9a-f]{128}$/);
      
      const isValid = await verifySignature(message, signature, keypair.public_key);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', async () => {
      const message = 'Hello, clawrrency!';
      const wrongMessage = 'Wrong message';
      const signature = await signMessage(message, keypair.private_key);
      
      const isValid = await verifySignature(wrongMessage, signature, keypair.public_key);
      expect(isValid).toBe(false);
    });

    it('should reject signatures with wrong public key', async () => {
      const message = 'Hello, clawrrency!';
      const signature = await signMessage(message, keypair.private_key);
      const otherKeypair = await generateKeyPair();
      
      const isValid = await verifySignature(message, signature, otherKeypair.public_key);
      expect(isValid).toBe(false);
    });
  });

  describe('Hashing', () => {
    it('should hash strings consistently', () => {
      const data = 'test data';
      const hash1 = hashData(data);
      const hash2 = hashData(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hashes for different data', () => {
      const hash1 = hashData('data1');
      const hash2 = hashData('data2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should hash objects with canonical JSON', () => {
      const obj = { b: 2, a: 1 };
      const hash = hashData(obj);
      
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('Transaction Hashing', () => {
    it('should hash transactions consistently', () => {
      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: 'abc123',
        to: 'def456',
        amount: 100,
        nonce: 1,
        timestamp: 1704067200000,
      };
      
      const hash1 = hashTransaction(tx);
      const hash2 = hashTransaction(tx);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce different hashes for different transactions', () => {
      const tx1 = {
        version: 1 as const,
        type: 'transfer' as const,
        from: 'abc123',
        to: 'def456',
        amount: 100,
        nonce: 1,
        timestamp: 1704067200000,
      };
      
      const tx2 = { ...tx1, amount: 200 };
      
      const hash1 = hashTransaction(tx1);
      const hash2 = hashTransaction(tx2);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Transaction Signing', () => {
    let keypair: { public_key: string; private_key: string };

    beforeAll(async () => {
      keypair = await generateKeyPair();
    });

    it('should sign and verify transactions', async () => {
      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: keypair.public_key,
        to: 'recipient123',
        amount: 100,
        nonce: 1,
        timestamp: Date.now(),
      };
      
      const signature = await signTransaction(tx, keypair.private_key);
      expect(signature).toMatch(/^[0-9a-f]{128}$/);
      
      const signedTx = { ...tx, signature };
      const isValid = await verifyTransactionSignature(signedTx);
      expect(isValid).toBe(true);
    });

    it('should reject tampered transactions', async () => {
      const tx = {
        version: 1 as const,
        type: 'transfer' as const,
        from: keypair.public_key,
        to: 'recipient123',
        amount: 100,
        nonce: 1,
        timestamp: Date.now(),
      };
      
      const signature = await signTransaction(tx, keypair.private_key);
      const signedTx = { ...tx, signature, amount: 999 };
      
      const isValid = await verifyTransactionSignature(signedTx);
      expect(isValid).toBe(false);
    });
  });

  describe('Canonical JSON', () => {
    it('should sort object keys', () => {
      const obj = { z: 1, a: 2, m: 3 };
      const canonical = canonicalJson(obj);
      
      expect(canonical).toBe('{"a":2,"m":3,"z":1}');
    });

    it('should handle nested objects', () => {
      const obj = { b: { z: 1, a: 2 }, a: 3 };
      const canonical = canonicalJson(obj);
      
      expect(canonical).toBe('{"a":3,"b":{"a":2,"z":1}}');
    });
  });

  describe('Validation', () => {
    it('should validate correct public keys', () => {
      const validKey = 'a'.repeat(64);
      expect(isValidPublicKey(validKey)).toBe(true);
    });

    it('should reject invalid public keys', () => {
      expect(isValidPublicKey('too short')).toBe(false);
      expect(isValidPublicKey('g'.repeat(64))).toBe(false); // Invalid hex
      expect(isValidPublicKey('a'.repeat(63))).toBe(false); // Wrong length
    });

    it('should validate correct signatures', () => {
      const validSig = 'a'.repeat(128);
      expect(isValidSignature(validSig)).toBe(true);
    });

    it('should reject invalid signatures', () => {
      expect(isValidSignature('too short')).toBe(false);
      expect(isValidSignature('g'.repeat(128))).toBe(false); // Invalid hex
      expect(isValidSignature('a'.repeat(127))).toBe(false); // Wrong length
    });
  });

  describe('Bot ID Derivation', () => {
    it('should derive bot IDs from public keys', () => {
      const publicKey = 'abcdef1234567890'.repeat(4); // 64 chars
      const botId = deriveBotId(publicKey);
      
      expect(botId).toMatch(/^bot_[a-f0-9]{16}$/);
      expect(botId).toBe('bot_abcdef1234567890');
    });
  });
});
