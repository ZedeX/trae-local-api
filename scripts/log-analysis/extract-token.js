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

const jwtPattern = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const tokens = new Set();

for (const match of text.matchAll(jwtPattern)) {
  const token = match[0];
  if (token.length > 500) {
    tokens.add(token);
  }
}

let bestToken = '';
for (const token of tokens) {
  if (token.length > bestToken.length) {
    bestToken = token;
  }
}

if (bestToken) {
  console.log(bestToken);
} else {
  console.error('No long JWT token found');
}
