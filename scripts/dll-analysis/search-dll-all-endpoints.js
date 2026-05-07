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

console.log('=== Searching for "/v1/chat/completions" ===');
const openaiEndpoint = searchContext('/v1/chat/completions', 50, 200);
for (const r of openaiEndpoint.slice(0, 5)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "chat/completions" ===');
const chatCompEndpoint = searchContext('chat/completions', 50, 200);
for (const r of chatCompEndpoint.slice(0, 5)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "CreateChatCompletion" ===');
const createChatResults = searchContext('CreateChatCompletion', 50, 500);
for (const r of createChatResults.slice(0, 5)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for all "/api/" paths ===');
const apiPaths = searchContext('/api/', 10, 80);
const uniquePaths = new Set();
for (const r of apiPaths) {
  const match = r.context.match(/\/api\/[a-zA-Z0-9_\/]+/g);
  if (match) {
    for (const m of match) {
      if (m.length > 10 && m.length < 80) uniquePaths.add(m);
    }
  }
}
console.log('Unique API paths found:');
const sortedPaths = [...uniquePaths].sort();
for (const p of sortedPaths) {
  console.log('  ', p);
}

console.log('\n=== Searching for all "/v1/" paths ===');
const v1Paths = searchContext('/v1/', 10, 80);
const uniqueV1Paths = new Set();
for (const r of v1Paths) {
  const match = r.context.match(/\/v1\/[a-zA-Z0-9_\/]+/g);
  if (match) {
    for (const m of match) {
      if (m.length > 5 && m.length < 80) uniqueV1Paths.add(m);
    }
  }
}
console.log('Unique /v1/ paths found:');
const sortedV1Paths = [...uniqueV1Paths].sort();
for (const p of sortedV1Paths) {
  console.log('  ', p);
}
