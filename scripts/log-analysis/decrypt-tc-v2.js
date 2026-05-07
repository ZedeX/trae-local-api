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
  console.log('Decrypted AES key length:', aesKey.length);
} catch (e) {
  console.log('DPAPI decrypt failed:', e.stderr || e.message);
  process.exit(1);
}

const authBuf = Buffer.from(authData, 'base64');
console.log('Auth buffer length:', authBuf.length);
console.log('Prefix:', authBuf.slice(0, 2).toString('utf8'));
console.log('Version:', authBuf.readUInt32LE(2));

const offsets = [
  { name: 'offset6', nonceOff: 6, nonceLen: 12 },
  { name: 'offset8', nonceOff: 8, nonceLen: 12 },
  { name: 'offset4', nonceOff: 4, nonceLen: 12 },
  { name: 'offset6-16nonce', nonceOff: 6, nonceLen: 16 },
  { name: 'offset4-16nonce', nonceOff: 4, nonceLen: 16 },
];

for (const { name, nonceOff, nonceLen } of offsets) {
  const nonce = authBuf.slice(nonceOff, nonceOff + nonceLen);
  const tag = authBuf.slice(-16);
  const ct = authBuf.slice(nonceOff + nonceLen, -16);

  if (ct.length <= 0) continue;

  try {
    const decipher = crypto.createDecipheriv(
      nonceLen === 12 ? 'aes-256-gcm' : 'aes-256-gcm',
      aesKey,
      nonce
    );
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    const result = decrypted.toString('utf8');
    console.log(`\n=== ${name}: DECRYPTED ===`);
    console.log('First 200 chars:', result.substring(0, 200));

    try {
      const authObj = JSON.parse(result);
      if (authObj.token) {
        console.log('Token length:', authObj.token.length);
        console.log('Token preview:', authObj.token.substring(0, 80) + '...');

        const envPath = path.join(__dirname, '..', '..', '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('TRAE_MANUAL_TOKEN=')) {
          envContent = envContent.replace(/TRAE_MANUAL_TOKEN=.*/, `TRAE_MANUAL_TOKEN=${authObj.token}`);
        } else {
          envContent += `\nTRAE_MANUAL_TOKEN=${authObj.token}`;
        }
        fs.writeFileSync(envPath, envContent);
        console.log('Token saved to .env!');
      }
    } catch (e) {
      console.log('Not valid JSON');
    }
    break;
  } catch (e) {
    console.log(`${name}: failed - ${e.message}`);
  }
}
