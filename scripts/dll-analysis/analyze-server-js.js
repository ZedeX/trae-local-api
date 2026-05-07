const fs = require('fs');

const filePath = 'D:\\_program\\Trae-CN\\resources\\app\\extensions\\ai-completion\\resource\\aiserver\\server.js';
const content = fs.readFileSync(filePath, 'utf8');

console.log('File size:', (content.length / 1024 / 1024).toFixed(1), 'MB');

const idx = content.indexOf('api/ide/v1/chat');
if (idx >= 0) {
  const start = Math.max(0, idx - 500);
  const end = Math.min(content.length, idx + 1000);
  console.log('\nContext around "api/ide/v1/chat":');
  console.log(content.substring(start, end));
}

console.log('\n\n=== Searching for chat-related function definitions ===');
const patterns = [
  /function\s+\w*[Cc]hat\w*\s*\(/g,
  /\w+\.chat\s*=\s*function/g,
  /chat\s*[:=]\s*(?:async\s+)?function/g,
  /async\s+\w*chat\w*\s*\(/g,
];

const found = new Set();
for (const p of patterns) {
  let m;
  while ((m = p.exec(content)) !== null) {
    const start = Math.max(0, m.index - 50);
    const end = Math.min(content.length, m.index + 200);
    const snippet = content.substring(start, end);
    if (!found.has(snippet)) {
      found.add(snippet);
      console.log(`\n${snippet}`);
    }
  }
}

console.log('\n\n=== Searching for "llm_raw_chat" in server.js ===');
const rawChatIdx = content.indexOf('llm_raw_chat');
if (rawChatIdx >= 0) {
  const start = Math.max(0, rawChatIdx - 500);
  const end = Math.min(content.length, rawChatIdx + 1000);
  console.log(content.substring(start, end));
}
