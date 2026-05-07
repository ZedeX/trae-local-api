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

console.log('=== Searching for "/api/ide/v1/chat" in logs ===');
const chatLines = lines.filter(l => 
  l.includes('/api/ide/v1/chat') && 
  !l.includes('run_command')
);
console.log(`Found ${chatLines.length} lines`);
for (const l of chatLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "llm_raw_chat" request details ===');
const rawChatLines = lines.filter(l => 
  l.includes('llm_raw_chat') && 
  (l.includes('request') || l.includes('req=') || l.includes('body')) &&
  !l.includes('run_command')
);
console.log(`Found ${rawChatLines.length} lines`);
for (const l of rawChatLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "LLMRawChat" request in logs ===');
const llmRawChatLines = lines.filter(l => 
  l.includes('LLMRawChat') && 
  !l.includes('run_command')
);
console.log(`Found ${llmRawChatLines.length} lines`);
for (const l of llmRawChatLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "connect" endpoint in logs ===');
const connectLines = lines.filter(l => 
  l.includes('/api/ide/v1/connect') && 
  !l.includes('run_command')
);
console.log(`Found ${connectLines.length} lines`);
for (const l of connectLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "aha_net" send with URL ===');
const ahaNetLines = lines.filter(l => 
  l.includes('[aha_net] send') && 
  l.includes('url=') &&
  !l.includes('run_command')
);
console.log(`Found ${ahaNetLines.length} lines`);
const urls = new Set();
for (const l of ahaNetLines) {
  const match = l.match(/url=([^,\s]+)/);
  if (match) urls.add(match[1]);
}
console.log('Unique URLs:');
for (const url of urls) {
  console.log(`  ${url}`);
}
