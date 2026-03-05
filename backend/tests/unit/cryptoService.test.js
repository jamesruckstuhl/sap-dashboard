import { describe, it, expect, beforeAll } from 'vitest';

// Set required env var before importing the module
beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-unit-tests-only';
});

// Dynamic import to ensure env var is set first
const { encrypt, decrypt } = await import('../../src/services/crypto/cryptoService.js');

describe('cryptoService', () => {
  describe('encrypt', () => {
    it('should produce an object with iv, authTag, and encrypted fields', () => {
      const result = encrypt('hello world');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result).toHaveProperty('encrypted');
    });

    it('should produce hex strings for all fields', () => {
      const result = encrypt('test plaintext');
      const hexRegex = /^[0-9a-f]+$/i;

      expect(result.iv).toMatch(hexRegex);
      expect(result.authTag).toMatch(hexRegex);
      expect(result.encrypted).toMatch(hexRegex);
    });

    it('should produce a 32-character (16-byte) iv', () => {
      const result = encrypt('test');
      // 16 bytes = 32 hex chars
      expect(result.iv.length).toBe(32);
    });

    it('should produce a 32-character (16-byte) authTag', () => {
      const result = encrypt('test');
      // GCM auth tag is 16 bytes = 32 hex chars
      expect(result.authTag.length).toBe(32);
    });

    it('should produce different iv values on different calls', () => {
      const result1 = encrypt('same text');
      const result2 = encrypt('same text');

      expect(result1.iv).not.toBe(result2.iv);
    });

    it('should produce different encrypted values on different calls (due to different IVs)', () => {
      const result1 = encrypt('same text');
      const result2 = encrypt('same text');

      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should throw TypeError if plaintext is not a string', () => {
      expect(() => encrypt(12345)).toThrow(TypeError);
      expect(() => encrypt(null)).toThrow();
      expect(() => encrypt(undefined)).toThrow();
    });
  });

  describe('decrypt', () => {
    it('should decrypt an encrypted value back to the original plaintext (round-trip)', () => {
      const original = 'my secret password';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should correctly round-trip empty string', () => {
      const original = '';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should correctly round-trip special characters', () => {
      const original = 'P@$$w0rd!#%^&*()_+-=[]{}|;:,.<>?/~`';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should correctly round-trip unicode text', () => {
      const original = 'SAP密码テスト пароль كلمة السر';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should correctly round-trip long strings', () => {
      const original = 'a'.repeat(10000);
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(original);
    });

    it('should throw on tampered authTag (integrity check)', () => {
      const encrypted = encrypt('sensitive data');
      const tampered = {
        ...encrypted,
        authTag: 'deadbeefdeadbeefdeadbeefdeadbeef',
      };

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw on tampered encrypted content', () => {
      const encResult = encrypt('original data');
      // Flip a hex character in the encrypted data
      const tamperedEncrypted = encResult.encrypted.slice(0, -2) + '00';
      const tampered = { ...encResult, encrypted: tamperedEncrypted };

      expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw if iv is missing', () => {
      const encrypted = encrypt('test');
      const { iv, ...withoutIv } = encrypted;

      expect(() => decrypt(withoutIv)).toThrow();
    });

    it('should throw if authTag is missing', () => {
      const encrypted = encrypt('test');
      const { authTag, ...withoutTag } = encrypted;

      expect(() => decrypt(withoutTag)).toThrow();
    });

    it('should throw if encrypted field is missing', () => {
      const encResult = encrypt('test');
      const { encrypted, ...withoutEncrypted } = encResult;

      expect(() => decrypt(withoutEncrypted)).toThrow();
    });
  });

  describe('multiple independent encryptions', () => {
    it('should each be independently decryptable', () => {
      const values = ['password1', 'password2', 'password3'];
      const encrypted = values.map(encrypt);

      encrypted.forEach((enc, i) => {
        expect(decrypt(enc)).toBe(values[i]);
      });
    });
  });
});
