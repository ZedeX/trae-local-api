const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getTraeDataDir } = require('./paths');

const HEADER_SIZE = 6;
const RANDOM_BYTES_LEN = 32;
const HASH_SIZE = 64;
const AES_KEY_SIZE = 16;
const IV_SIZE = 16;

const SALT_A = process.env.TRAE_SALT_A ? JSON.parse(process.env.TRAE_SALT_A) : Uint8Array.from([82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37]);
const SALT_B = process.env.TRAE_SALT_B ? JSON.parse(process.env.TRAE_SALT_B) : Uint8Array.from([31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125]);
const SALT_C = process.env.TRAE_SALT_C ? JSON.parse(process.env.TRAE_SALT_C) : Uint8Array.from([191,192,216,250,122,246,220,97,31,254,98,27,8,72,71,176,135,99,96,18,127,101,203,104,211,102,191,125,37,72,150,156,51,229,121,35,17,153,141,177,110,131,150,128,172,255,254,6,18,140,55,62,236,249,135,64,135,12,117,4,89,149,168,209]);
const SALT_D = process.env.TRAE_SALT_D ? JSON.parse(process.env.TRAE_SALT_D) : Uint8Array.from([246,204,26,232,232,70,129,109,223,146,169,242,23,241,105,145,50,196,165,42,254,120,3,54,244,207,209,85,53,6,138,106,175,148,31,204,186,186,165,182,87,142,49,10,39,110,26,154,86,56,173,125,18,64,198,225,99,99,83,82,191,134,76,170]);

function xorSalts(a, b, len) {
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

function sha512(data) {
  return crypto.createHash('sha512').update(Buffer.from(data)).digest();
}

function detectEncType(header) {
  if (header[0] === 0x74 && header[1] === 0x63 && header[2] === 0x05 && header[3] === 0x10 && header[4] === 0x00 && header[5] === 0x00) {
    return 'AES';
  }
  if (header[0] === 18 && header[1] === 57 && header[2] === 32 && header[3] === 32 && header[4] === 2 && header[5] === 3) {
    return 'AES_PRIVATE';
  }
  return 'UNKNOWN';
}

function deriveKeyAndIV(randomBytes, encType) {
  let salt;
  if (encType === 'AES_PRIVATE') {
    salt = xorSalts(SALT_C, SALT_D, HASH_SIZE);
  } else {
    salt = xorSalts(SALT_A, SALT_B, HASH_SIZE);
  }

  const hashOfRandom = sha512(randomBytes);
  const combined = Buffer.concat([hashOfRandom, Buffer.from(salt)]);
  const finalHash = sha512(combined);

  const aesKey = finalHash.slice(0, AES_KEY_SIZE);
  const iv = finalHash.slice(AES_KEY_SIZE, AES_KEY_SIZE + IV_SIZE);

  return { aesKey, iv };
}

function aesCbcDecrypt(key, iv, data) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
}

function isTcEncrypted(buffer) {
  return buffer.length >= HEADER_SIZE &&
    buffer[0] === 0x74 &&
    buffer[1] === 0x63;
}

function decryptTcBuffer(encryptedBuffer) {
  if (encryptedBuffer.length < HEADER_SIZE + RANDOM_BYTES_LEN + HASH_SIZE + 16) {
    throw new Error(`Buffer too short: ${encryptedBuffer.length}`);
  }

  const header = encryptedBuffer.slice(0, HEADER_SIZE);
  const encType = detectEncType(header);

  if (encType === 'UNKNOWN') {
    throw new Error(`Unknown encryption type. Header: ${header.toString('hex')}`);
  }

  const randomBytes = encryptedBuffer.slice(HEADER_SIZE, HEADER_SIZE + RANDOM_BYTES_LEN);
  const encryptedData = encryptedBuffer.slice(HEADER_SIZE + RANDOM_BYTES_LEN);

  const { aesKey, iv } = deriveKeyAndIV(randomBytes, encType);

  let decrypted;
  try {
    decrypted = aesCbcDecrypt(aesKey, iv, encryptedData);
  } catch (e) {
    throw new Error(`AES-128-CBC decryption failed: ${e.message}`);
  }

  if (decrypted.length < HASH_SIZE) {
    throw new Error(`Decrypted data too short: ${decrypted.length}`);
  }

  const storedHash = decrypted.slice(0, HASH_SIZE);
  const plaintext = decrypted.slice(HASH_SIZE);
  const computedHash = sha512(plaintext);

  let hashValid = true;
  for (let i = 0; i < HASH_SIZE; i++) {
    if (computedHash[i] !== storedHash[i]) {
      hashValid = false;
      break;
    }
  }

  if (!hashValid) {
    throw new Error('Hash verification failed - data may be corrupted or wrong key');
  }

  return plaintext.toString('utf8');
}

function decryptStorageValue(base64Value) {
  const buffer = Buffer.from(base64Value, 'base64');
  return decryptTcBuffer(buffer);
}

function getStorageJsonPath(dataDir) {
  if (!dataDir) {
    dataDir = getTraeDataDir();
  }
  return path.join(dataDir, 'User', 'globalStorage', 'storage.json');
}

function decryptAuthData(dataDir) {
  if (!dataDir) {
    dataDir = getTraeDataDir();
  }

  const storagePath = getStorageJsonPath(dataDir);
  if (!fs.existsSync(storagePath)) {
    throw new Error(`storage.json not found: ${storagePath}`);
  }

  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  const authKey = 'iCubeAuthInfo://icube.cloudide';
  const encryptedAuth = storage[authKey];

  if (!encryptedAuth) {
    throw new Error(`Auth key "${authKey}" not found in storage.json`);
  }

  if (typeof encryptedAuth === 'string' && (encryptedAuth.trim().startsWith('{') || encryptedAuth.trim().startsWith('"'))) {
    return JSON.parse(encryptedAuth);
  }

  const decrypted = decryptStorageValue(encryptedAuth);
  return JSON.parse(decrypted);
}

function decryptAllEncryptedValues(dataDir) {
  if (!dataDir) {
    dataDir = getTraeDataDir();
  }

  const storagePath = getStorageJsonPath(dataDir);
  if (!fs.existsSync(storagePath)) {
    throw new Error(`storage.json not found: ${storagePath}`);
  }

  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  const results = {};

  for (const [k, v] of Object.entries(storage)) {
    if (typeof v !== 'string' || v.length < 10) continue;

    if (v.trim().startsWith('{') || v.trim().startsWith('"')) {
      continue;
    }

    try {
      const buf = Buffer.from(v, 'base64');
      if (buf.length >= HEADER_SIZE && isTcEncrypted(buf)) {
        try {
          results[k] = JSON.parse(decryptTcBuffer(buf));
        } catch (e) {
          results[k] = { _decryptError: e.message };
        }
      }
    } catch (e) {}
  }

  return results;
}

module.exports = {
  isTcEncrypted,
  detectEncType,
  deriveKeyAndIV,
  decryptTcBuffer,
  decryptStorageValue,
  decryptAuthData,
  decryptAllEncryptedValues,
  getStorageJsonPath,
  HEADER_SIZE,
  RANDOM_BYTES_LEN,
  HASH_SIZE,
  AES_KEY_SIZE,
  IV_SIZE
};
