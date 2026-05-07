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

console.log('Encrypted key (base64):', encryptedKeyB64.substring(0, 30) + '...');

const encryptedKeyBuffer = Buffer.from(encryptedKeyB64, 'base64');
console.log('Key buffer length:', encryptedKeyBuffer.length);
console.log('Key prefix:', encryptedKeyBuffer.slice(0, 5).toString('ascii'));

const dpapiEncryptedKey = encryptedKeyBuffer.slice(5);
console.log('DPAPI encrypted key length:', dpapiEncryptedKey.length);

const dpapiKeyHex = dpapiEncryptedKey.toString('base64');

const psScript = `
Add-Type -AssemblyName System.Security
$dpapiKeyB64 = "${dpapiKeyHex}"
$dpapiKeyBytes = [System.Convert]::FromBase64String($dpapiKeyB64)
try {
    $decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $dpapiKeyBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $keyHex = [System.BitConverter]::ToString($decryptedKey).Replace('-', '').ToLower()
    Write-Host "AES_KEY_HEX:$keyHex"
} catch {
    Write-Error "DPAPI key decrypt failed: $_"
}
`;

const psPath = path.join('d:', '_program', 'Trae', 'zx-test', 'decrypt-key.ps1');
fs.writeFileSync(psPath, psScript, 'utf-8');

let aesKeyHex;
try {
  const result = execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000
  });
  console.log('\nKey decrypt result:', result.substring(0, 200));
  const match = result.match(/AES_KEY_HEX:([a-f0-9]+)/);
  if (match) {
    aesKeyHex = match[1];
    console.log('AES Key (hex):', aesKeyHex);
    console.log('AES Key length:', aesKeyHex.length / 2, 'bytes');
  } else {
    console.error('Failed to extract AES key');
    process.exit(1);
  }
} catch (err) {
  console.error('Key decrypt failed:', err.message);
  process.exit(1);
}

const encryptedBuffer = Buffer.from(encryptedAuth, 'base64');
console.log('\nEncrypted auth buffer length:', encryptedBuffer.length);
console.log('Prefix:', encryptedBuffer.slice(0, 2).toString('ascii'));
console.log('Version:', encryptedBuffer.readUInt16LE(2));

const version = encryptedBuffer.readUInt16LE(2);
if (version !== 4101) {
  console.error('Unexpected version:', version);
  process.exit(1);
}

const nonceLength = 12;
const nonce = encryptedBuffer.slice(8, 8 + nonceLength);
const ciphertextWithTag = encryptedBuffer.slice(8 + nonceLength);
const tagLength = 16;
const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - tagLength);
const tag = ciphertextWithTag.slice(ciphertextWithTag.length - tagLength);

console.log('Nonce (hex):', nonce.toString('hex'));
console.log('Ciphertext length:', ciphertext.length);
console.log('Tag (hex):', tag.toString('hex'));

const aesKey = Buffer.from(aesKeyHex, 'hex');

try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const decryptedText = decrypted.toString('utf-8');
  console.log('\n=== DECRYPTED AUTH DATA ===');
  console.log(decryptedText.substring(0, 500));
  
  const outputPath = path.join('d:', '_program', 'Trae', 'zx-test', 'cn-auth-decrypted.json');
  fs.writeFileSync(outputPath, decryptedText, 'utf-8');
  console.log('\nSaved to:', outputPath);
} catch (err) {
  console.error('AES-GCM decrypt failed:', err.message);
}
