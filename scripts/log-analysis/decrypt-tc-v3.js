const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

const username = os.userInfo().username;
const storagePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage\\storage.json`);
const localStatePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\Local State`);

const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
const authData = storage['iCubeAuthInfo://icube.cloudide'];
const encryptedKey = localState.os_crypt.encrypted_key;

const psScriptPath = path.join(__dirname, '..', 'decrypt', 'dpapi-decrypt-key.ps1');
let aesKey;
try {
  const hexResult = execSync(
    `powershell -ExecutionPolicy Bypass -File "${psScriptPath}" "${encryptedKey}"`,
    { encoding: 'utf8', timeout: 30000 }
  ).trim();
  aesKey = Buffer.from(hexResult, 'hex');
  console.log('AES key length:', aesKey.length);
} catch (e) {
  console.log('DPAPI failed:', e.message);
  process.exit(1);
}

const authBuf = Buffer.from(authData, 'base64');
console.log('Auth buffer length:', authBuf.length);

console.log('\n=== Byte-by-byte analysis ===');
console.log('Bytes 0-5 (header):');
for (let i = 0; i < 6; i++) {
  console.log(`  [${i}] = 0x${authBuf[i].toString(16).padStart(2, '0')} (${authBuf[i]})`);
}

console.log('\nBytes 6-25 (potential nonce):');
const hex6_25 = [];
for (let i = 6; i < 26; i++) {
  hex6_25.push(authBuf[i].toString(16).padStart(2, '0'));
}
console.log('  ' + hex6_25.join(' '));

console.log('\nLast 32 bytes:');
const last32 = [];
for (let i = authBuf.length - 32; i < authBuf.length; i++) {
  last32.push(authBuf[i].toString(16).padStart(2, '0'));
}
console.log('  ' + last32.join(' '));

const shortAuthData = storage['iCubeAuthInfo://usertag'];
if (shortAuthData) {
  const shortBuf = Buffer.from(shortAuthData, 'base64');
  console.log('\n=== Short encrypted entry (usertag) ===');
  console.log('Length:', shortBuf.length);
  console.log('All bytes:');
  const hex = [];
  for (let i = 0; i < shortBuf.length; i++) {
    hex.push(shortBuf[i].toString(16).padStart(2, '0'));
  }
  console.log('  ' + hex.join(' '));
  console.log('Prefix:', shortBuf.slice(0, 2).toString('utf8'));
  console.log('Version:', shortBuf.readUInt32LE(2));

  console.log('\nTrying all possible nonce/tag offsets on short entry...');
  for (let nonceOff = 4; nonceOff <= 10; nonceOff++) {
    for (let nonceLen = 12; nonceLen <= 16; nonceLen++) {
      if (nonceOff + nonceLen + 1 + 16 > shortBuf.length) continue;
      const nonce = shortBuf.slice(nonceOff, nonceOff + nonceLen);
      const tag = shortBuf.slice(-16);
      const ct = shortBuf.slice(nonceOff + nonceLen, -16);
      if (ct.length <= 0) continue;

      try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
        console.log(`  nonceOff=${nonceOff} nonceLen=${nonceLen}: "${decrypted.toString('utf8')}"`);
      } catch {}
    }
  }
}
