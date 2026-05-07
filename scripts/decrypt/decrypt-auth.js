const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

app.whenReady().then(() => {
  try {
    const cnStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
    const storage = JSON.parse(fs.readFileSync(cnStoragePath, 'utf-8'));
    const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

    if (!encryptedAuth) {
      console.error('No encrypted auth data found');
      app.exit(1);
      return;
    }

    console.log('Encrypted auth starts with:', encryptedAuth.substring(0, 20));

    const buffer = Buffer.from(encryptedAuth, 'base64');
    console.log('Buffer length:', buffer.length);
    console.log('Buffer starts with:', buffer.slice(0, 10).toString('hex'));

    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(buffer);
      console.log('Decrypted auth:', decrypted);
      
      const outputPath = path.join('d:', '_program', 'Trae', 'zx-test', 'cn-auth-decrypted.json');
      fs.writeFileSync(outputPath, decrypted, 'utf-8');
      console.log('Saved to:', outputPath);
    } else {
      console.error('SafeStorage not available');
    }
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  }
  app.exit(0);
});
