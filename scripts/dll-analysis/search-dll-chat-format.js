const fs = require('fs');
const path = require('path');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const stat = fs.statSync(dllPath);
const readSize = Math.min(stat.size, 100 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);
const fd = fs.openSync(dllPath, 'r');
fs.readSync(fd, buffer, 0, readSize, 0);
fs.closeSync(fd);

function searchContext(term, contextBefore, contextAfter) {
  const tBytes = Buffer.from(term, 'utf8');
  const results = [];
  for (let i = 0; i < buffer.length - tBytes.length; i++) {
    let found = true;
    for (let j = 0; j < tBytes.length; j++) {
      if (buffer[i + j] !== tBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      const start = Math.max(0, i - contextBefore);
      const end = Math.min(buffer.length, i + term.length + contextAfter);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      results.push({ offset: i, context });
    }
  }
  return results;
}

console.log('=== Searching for "LLMRawChat" ===');
const rawChatResults = searchContext('LLMRawChat', 50, 500);
for (const r of rawChatResults.slice(0, 10)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "llm_raw_chat" ===');
const llmRawResults = searchContext('llm_raw_chat', 50, 500);
for (const r of llmRawResults.slice(0, 10)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "RawChatRequest" ===');
const rawReqResults = searchContext('RawChatRequest', 50, 500);
for (const r of rawReqResults.slice(0, 10)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "ChatRequest" ===');
const chatReqResults = searchContext('ChatRequest', 50, 500);
for (const r of chatReqResults.slice(0, 10)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "/api/ide/v1/chat" ===');
const chatEndpointResults = searchContext('/api/ide/v1/chat', 50, 200);
for (const r of chatEndpointResults.slice(0, 5)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}
