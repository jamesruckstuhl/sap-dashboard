'use strict';

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const SALT = 'sap-dashboard-salt';
const KEY_LENGTH = 32;

function getDerivedKey() {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return crypto.scryptSync(encryptionKey, SALT, KEY_LENGTH);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} plaintext
 * @returns {{ iv: string, authTag: string, encrypted: string }} - all hex strings
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('plaintext must be a string');
  }

  const key = getDerivedKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted,
  };
}

/**
 * Decrypts an AES-256-GCM encrypted object.
 * @param {{ iv: string, authTag: string, encrypted: string }} encryptedObj
 * @returns {string} plaintext
 */
function decrypt({ iv, authTag, encrypted }) {
  if (iv == null || authTag == null || encrypted == null) {
    throw new Error('Invalid encrypted object: missing iv, authTag, or encrypted fields');
  }

  const key = getDerivedKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

module.exports = { encrypt, decrypt };
