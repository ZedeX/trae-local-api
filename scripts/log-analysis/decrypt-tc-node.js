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

const keyBytes = Buffer.from(encryptedKey, 'base64');
const dpapiEncryptedKey = keyBytes.slice(5);

const psScript = `
Add-Type -AssemblyName System.Security
$keyBytes = [Convert]::FromBase64String("${encryptedKey}")
$keyBytes = $keyBytes[5..($keyBytes.Length - 1)]
$decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $keyBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
$hex = ($decryptedKey | ForEach-Object { $_.ToString("x2") }) -Join ""
Write-Host $hex
`;

let aesKey;
try {
  const hexResult = execSync(`powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    encoding: 'utf8',
    timeout: 30000
  }).trim();
  aesKey = Buffer.from(hexResult, 'hex');
  console.log('Decrypted AES key length:', aesKey.length);
  console.log('Key (hex):', aesKey.toString('hex'));
} catch (e) {
  console.log('DPAPI decrypt failed:', e.message);
  process.exit(1);
}

const authBuf = Buffer.from(authData, 'base64');
console.log('\nAuth buffer length:', authBuf.length);
console.log('Prefix:', authBuf.slice(0, 2).toString('utf8'));
console.log('Version:', authBuf.readUInt32LE(2));

const nonceOffset = 6;
const nonceLength = 12;
const nonce = authBuf.slice(nonceOffset, nonceOffset + nonceLength);
console.log('Nonce:', nonce.toString('hex'));

const tagOffset = authBuf.length - 16;
const tag = authBuf.slice(tagOffset);
console.log('Tag:', tag.toString('hex'));

const ciphertext = authBuf.slice(nonceOffset + nonceLength, tagOffset);
console.log('Ciphertext length:', ciphertext.length);

try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const result = decrypted.toString('utf8');
  console.log('\n=== DECRYPTED AUTH DATA ===');

  try {
    const authObj = JSON.parse(result);
    console.log('Token length:', authObj.token?.length);
    console.log('Token preview:', authObj.token?.substring(0, 80) + '...');
    console.log('Has refreshToken:', !!authObj.refreshToken);
    console.log('UserId:', authObj.userId);
    console.log('Host:', authObj.host);

    if (authObj.token) {
      const envPath = path.join(__dirname, '..', '..', '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('TRAE_MANUAL_TOKEN=')) {
        envContent = envContent.replace(/TRAE_MANUAL_TOKEN=.*/, `TRAE_MANUAL_TOKEN=${authObj.token}`);
      } else {
        envContent += `\nTRAE_MANUAL_TOKEN=${authObj.token}`;
      }
      fs.writeFileSync(envPath, envContent);
      console.log('\nToken saved to .env!');
    }
  } catch (e) {
    console.log('Raw decrypted (first 300 chars):', result.substring(0, 300));
  }
} catch (e) {
  console.log('AES-256-GCM decrypt failed:', e.message);

  console.log('\nTrying offset 8 for nonce...');
  const nonce2 = authBuf.slice(8, 20);
  const tag2 = authBuf.slice(-16);
  const ct2 = authBuf.slice(20, -16);
  try {
    const d2 = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce2);
    d2.setAuthTag(tag2);
    const r2 = Buffer.concat([d2.update(ct2), d2.final()]);
    console.log('Decrypted with offset 8:', r2.toString('utf8').substring(0, 200));
  } catch (e2) {
    console.log('Offset 8 also failed:', e2.message);
  }
}
