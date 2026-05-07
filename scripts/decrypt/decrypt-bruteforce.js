const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const cnStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
const localStatePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'Local State');

const storage = JSON.parse(fs.readFileSync(cnStoragePath, 'utf-8'));
const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
const encryptedKeyB64 = localState.os_crypt.encrypted_key;

const encryptedKeyBuffer = Buffer.from(encryptedKeyB64, 'base64');
const dpapiEncryptedKey = encryptedKeyBuffer.slice(5);

const dpapiKeyHex = dpapiEncryptedKey.toString('base64');

const psScript = `
Add-Type -AssemblyName System.Security
$dpapiKeyB64 = "${dpapiKeyHex}"
$dpapiKeyBytes = [System.Convert]::FromBase64String($dpapiKeyB64)
$decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $dpapiKeyBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
$keyHex = [System.BitConverter]::ToString($decryptedKey).Replace('-', '').ToLower()
Write-Host "AES_KEY_HEX:$keyHex"
`;

const psPath = path.join('d:', '_program', 'Trae', 'zx-test', 'decrypt-key.ps1');
fs.writeFileSync(psPath, psScript, 'utf-8');

const keyResult = execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, {
  encoding: 'utf-8',
  maxBuffer: 10 * 1024 * 1024,
  timeout: 30000
});
const match = keyResult.match(/AES_KEY_HEX:([a-f0-9]+)/);
const aesKeyHex = match[1];
console.log('AES Key:', aesKeyHex);

const encryptedBuffer = Buffer.from(encryptedAuth, 'base64');
console.log('Total length:', encryptedBuffer.length);

console.log('\nHex dump first 20 bytes:');
console.log(encryptedBuffer.slice(0, 20).toString('hex'));

const prefix = encryptedBuffer.slice(0, 2).toString('ascii');
console.log('Prefix:', prefix);

const version = encryptedBuffer.readUInt16LE(2);
console.log('Version:', version, '(0x' + version.toString(16) + ')');

const aesKey = Buffer.from(aesKeyHex, 'hex');

const nonceLength = 12;
const tagLength = 16;

const offsets = [4, 6, 8, 10, 12];

for (const offset of offsets) {
  const nonce = encryptedBuffer.slice(offset, offset + nonceLength);
  const ciphertextWithTag = encryptedBuffer.slice(offset + nonceLength);
  const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - tagLength);
  const tag = ciphertextWithTag.slice(ciphertextWithTag.length - tagLength);
  
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const decryptedText = decrypted.toString('utf-8');
    console.log(`\n*** SUCCESS with offset ${offset} ***`);
    console.log('Decrypted:', decryptedText.substring(0, 300));
    
    const outputPath = path.join('d:', '_program', 'Trae', 'zx-test', 'cn-auth-decrypted.json');
    fs.writeFileSync(outputPath, decryptedText, 'utf-8');
    console.log('Saved to:', outputPath);
    process.exit(0);
  } catch (err) {
    console.log(`Offset ${offset}: failed - ${err.message}`);
  }
}

console.log('\nAll offsets failed. Trying with "v10" prefix format...');

const v10Nonce = Buffer.alloc(12, 0);
const v10CiphertextWithTag = encryptedBuffer.slice(3);
const v10Ciphertext = v10CiphertextWithTag.slice(0, v10CiphertextWithTag.length - tagLength);
const v10Tag = v10CiphertextWithTag.slice(v10CiphertextWithTag.length - tagLength);

try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, v10Nonce);
  decipher.setAuthTag(v10Tag);
  const decrypted = Buffer.concat([decipher.update(v10Ciphertext), decipher.final()]);
  console.log('v10 format SUCCESS:', decrypted.toString('utf-8').substring(0, 300));
} catch (err) {
  console.log('v10 format failed:', err.message);
}

console.log('\nTrying with "v20" prefix format (nonce from bytes 3-15)...');
const v20Nonce = encryptedBuffer.slice(3, 15);
const v20CiphertextWithTag = encryptedBuffer.slice(15);
const v20Ciphertext = v20CiphertextWithTag.slice(0, v20CiphertextWithTag.length - tagLength);
const v20Tag = v20CiphertextWithTag.slice(v20CiphertextWithTag.length - tagLength);

try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, v20Nonce);
  decipher.setAuthTag(v20Tag);
  const decrypted = Buffer.concat([decipher.update(v20Ciphertext), decipher.final()]);
  console.log('v20 format SUCCESS:', decrypted.toString('utf-8').substring(0, 300));
} catch (err) {
  console.log('v20 format failed:', err.message);
}
