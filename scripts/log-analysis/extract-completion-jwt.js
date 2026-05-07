const fs = require('fs');
const path = require('path');
const os = require('os');

const username = os.userInfo().username;
const logBase = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\logs`);
const dirs = fs.readdirSync(logBase).sort();
const latestDir = dirs[dirs.length - 2];
const latestPath = path.join(logBase, latestDir);

const completionLog = path.join(latestPath, 'window1', 'exthost', 'trae.ai-code-completion', 'completion.log');
console.log('Reading:', completionLog);

const content = fs.readFileSync(completionLog, 'utf8');
const lines = content.split('\n');

const tokens = new Set();
for (const line of lines) {
  const match = line.match(/(?:Cloud-IDE-JWT|cloud-ide-jwt)[^a-zA-Z]*([a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})/);
  if (match) {
    tokens.add(match[1]);
  }
}

console.log('Unique tokens found:', tokens.size);

const tokenList = [...tokens];
for (let i = 0; i < tokenList.length; i++) {
  const token = tokenList[i];
  console.log(`\nToken #${i + 1}:`);
  console.log('  Length:', token.length);
  console.log('  Preview:', token.substring(0, 80) + '...');

  try {
    const parts = token.split('.');
    const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('  Header alg:', header.alg);
    console.log('  Payload keys:', Object.keys(payload));
    if (payload.exp) {
      const expDate = new Date(payload.exp * 1000);
      console.log('  Expires:', expDate.toISOString());
      console.log('  Is expired:', expDate < new Date());
    }
    if (payload.data) {
      console.log('  Data keys:', Object.keys(payload.data));
    }
  } catch (e) {
    console.log('  Parse error:', e.message);
  }
}

if (tokenList.length > 0) {
  const latestToken = tokenList[tokenList.length - 1];
  const envPath = path.join(__dirname, '..', '..', '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('TRAE_MANUAL_TOKEN=')) {
    envContent = envContent.replace(/TRAE_MANUAL_TOKEN=.*/, `TRAE_MANUAL_TOKEN=${latestToken}`);
  } else {
    envContent += `\nTRAE_MANUAL_TOKEN=${latestToken}`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log('\nLatest token saved to .env!');
}
