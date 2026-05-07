const fs = require('fs');
const path = require('path');

const logsDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular';
const logFiles = fs.readdirSync(logsDir).filter(f => f.includes('ai-agent') && f.includes('stdout'));
const logFile = path.join(logsDir, logFiles[0]);

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 50 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('=== Searching for JWT tokens in recent logs ===');
const jwtPattern = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const tokens = new Set();

for (const line of lines) {
  const matches = line.matchAll(jwtPattern);
  for (const match of matches) {
    const token = match[0];
    if (token.length > 100) {
      tokens.add(token);
    }
  }
}

console.log(`Found ${tokens.size} unique JWT tokens`);
let idx = 0;
for (const token of tokens) {
  idx++;
  console.log(`\nToken #${idx} (${token.length} chars):`);
  console.log(token.substring(0, 80) + '...');
  
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log(`  exp: ${new Date(payload.exp * 1000).toISOString()}`);
    console.log(`  iat: ${new Date(payload.iat * 1000).toISOString()}`);
    console.log(`  data:`, JSON.stringify(payload.data));
    const now = Date.now() / 1000;
    if (payload.exp > now) {
      console.log(`  STATUS: VALID (expires in ${((payload.exp - now) / 3600).toFixed(1)} hours)`);
    } else {
      console.log(`  STATUS: EXPIRED`);
    }
  } catch (e) {
    console.log(`  Failed to decode: ${e.message}`);
  }
}

console.log('\n=== Searching for Authorization header in logs ===');
const authLines = lines.filter(l => 
  l.includes('Authorization') && 
  l.includes('Cloud-IDE-JWT') &&
  !l.includes('run_command')
);
console.log(`Found ${authLines.length} lines with Authorization header`);
for (const l of authLines.slice(-3)) {
  const match = l.match(/Cloud-IDE-JWT (eyJ[A-Za-z0-9_-]+)/);
  if (match) {
    console.log(`Token: ${match[1].substring(0, 80)}...`);
  }
}
