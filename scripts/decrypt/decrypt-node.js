const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

try {
  const cnStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
  const storage = JSON.parse(fs.readFileSync(cnStoragePath, 'utf-8'));
  const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

  if (!encryptedAuth) {
    process.stderr.write('[DECRYPT] No encrypted auth data found\n');
    process.exit(1);
  }

  if (!safeStorage.isEncryptionAvailable()) {
    process.stderr.write('[DECRYPT] safeStorage not available\n');
    process.exit(1);
  }

  const buffer = Buffer.from(encryptedAuth, 'base64');
  const decryptedText = safeStorage.decryptString(buffer);
  
  process.stdout.write('[DECRYPT] SUCCESS\n');
  process.stdout.write('[DECRYPT] ' + decryptedText + '\n');
  
  const outputPath = path.join('d:', '_program', 'Trae', 'zx-test', 'cn-auth-decrypted.json');
  fs.writeFileSync(outputPath, decryptedText, 'utf-8');
  process.stdout.write('[DECRYPT] Saved to: ' + outputPath + '\n');
} catch (err) {
  process.stderr.write('[DECRYPT] Error: ' + err.message + '\n');
  process.exit(1);
}
