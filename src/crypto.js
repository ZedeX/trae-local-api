const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY_ENV_VAR = 'TRAE_API_ENCRYPT_KEY';

function getEncryptionKey() {
  let key = process.env[KEY_ENV_VAR];
  if (!key) {
    key = crypto.randomBytes(32).toString('hex');
    process.env[KEY_ENV_VAR] = key;
  }
  if (key.length < 64) {
    key = key.padEnd(64, '0');
  }
  return Buffer.from(key.substring(0, 64), 'hex');
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashContent,
  getEncryptionKey
};
