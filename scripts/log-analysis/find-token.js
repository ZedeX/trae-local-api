const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const username = os.userInfo().username;
const tmpDir = os.tmpdir();

console.log('=== Searching for Trae ai-agent logs ===\n');

const allDirs = fs.readdirSync(tmpDir);
const traeDirs = allDirs.filter(d => {
  try {
    const full = path.join(tmpDir, d);
    const st = fs.statSync(full);
    return st.isDirectory() && (d.startsWith('trae-') || d.includes('Trae'));
  } catch { return false; }
});

console.log('Found temp dirs:', traeDirs.join(', '));

for (const dir of traeDirs) {
  const full = path.join(tmpDir, dir);
  console.log(`\n--- ${dir} ---`);
  try {
    const files = fs.readdirSync(full);
    console.log('Files:', files.join(', '));
  } catch (e) {
    console.log('Error:', e.message);
  }
}

console.log('\n=== Searching for JWT in all temp files ===\n');

const searchPatterns = ['trae-ai-agent', 'trae-agent', 'Trae'];
for (const pattern of searchPatterns) {
  const dirs = allDirs.filter(d => d.toLowerCase().includes(pattern.toLowerCase()));
  for (const dir of dirs) {
    const full = path.join(tmpDir, dir);
    try {
      const files = fs.readdirSync(full).filter(f => f.endsWith('.log'));
      for (const file of files) {
        const logPath = path.join(full, file);
        const content = fs.readFileSync(logPath, 'utf8');
        const jwtMatch = content.match(/eyJ[A-Za-z0-9_-]{100,}/g);
        if (jwtMatch) {
          console.log(`Found JWT in ${logPath}:`);
          jwtMatch.forEach((jwt, i) => {
            console.log(`  JWT #${i + 1}: length=${jwt.length}, preview=${jwt.substring(0, 60)}...`);
          });
        }
      }
    } catch (e) {}
  }
}

console.log('\n=== Trying DPAPI decryption ===\n');

const storagePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage\\storage.json`);
try {
  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  const authKey = 'iCubeAuthInfo://icube.cloudide';
  const authData = storage[authKey];

  if (authData) {
    console.log('Auth data found, length:', authData.length);
    console.log('First 20 chars:', authData.substring(0, 20));
    console.log('Is encrypted:', authData.startsWith('v10') || authData.startsWith('dGMFE'));

    if (authData.startsWith('dGMFE')) {
      console.log('\nFormat: Base64 encoded encrypted data');
      const buf = Buffer.from(authData, 'base64');
      console.log('Decoded length:', buf.length);
      console.log('First bytes:', buf.slice(0, 20).toString('hex'));
      console.log('Version byte:', buf[0]);
      console.log('This appears to be Chromium os_crypt encrypted data (v10/v11 prefix)');
    }
  }
} catch (e) {
  console.log('Error reading storage:', e.message);
}

console.log('\n=== Trying to find token via Trae log files ===\n');

const logDirs = [
  path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\logs`),
  path.join(`C:\\Users\\${username}\\AppData\\Local\\Trae\\logs`),
];

for (const logDir of logDirs) {
  try {
    if (!fs.existsSync(logDir)) {
      console.log(`Not found: ${logDir}`);
      continue;
    }
    console.log(`Found: ${logDir}`);
    const files = fs.readdirSync(logDir, { recursive: true });
    for (const file of files) {
      const filePath = path.join(logDir, String(file));
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const jwtMatch = content.match(/eyJ[A-Za-z0-9_-]{100,}/g);
        if (jwtMatch) {
          console.log(`Found JWT in ${filePath}:`);
          jwtMatch.forEach((jwt, i) => {
            console.log(`  JWT #${i + 1}: length=${jwt.length}, preview=${jwt.substring(0, 60)}...`);
          });
        }
      } catch {}
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
