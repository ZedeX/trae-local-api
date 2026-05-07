const { app, safeStorage, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

let decrypted = false;

app.on('ready', () => {
  try {
    const cnStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
    const storage = JSON.parse(fs.readFileSync(cnStoragePath, 'utf-8'));
    const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

    if (!encryptedAuth) {
      console.error('[DECRYPT] No encrypted auth data found');
      app.exit(1);
      return;
    }

    console.log('[DECRYPT] Encrypted auth starts with:', encryptedAuth.substring(0, 20));

    if (!safeStorage.isEncryptionAvailable()) {
      console.error('[DECRYPT] safeStorage not available');
      app.exit(1);
      return;
    }

    const buffer = Buffer.from(encryptedAuth, 'base64');
    const decryptedText = safeStorage.decryptString(buffer);
    
    console.log('[DECRYPT] SUCCESS!');
    console.log('[DECRYPT] Decrypted auth:', decryptedText.substring(0, 300));
    
    const outputPath = path.join('d:', '_program', 'Trae', 'zx-test', 'cn-auth-decrypted.json');
    fs.writeFileSync(outputPath, decryptedText, 'utf-8');
    console.log('[DECRYPT] Saved to:', outputPath);
    
    decrypted = true;
  } catch (err) {
    console.error('[DECRYPT] Error:', err.message);
    console.error(err.stack);
  }
  
  setTimeout(() => { app.exit(decrypted ? 0 : 1); }, 2000);
});

app.on('window-all-closed', () => {
  if (decrypted) app.exit(0);
});
