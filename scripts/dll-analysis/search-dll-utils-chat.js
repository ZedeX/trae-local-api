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

console.log('=== Searching for "llm_utils_chat" ===');
const utilsChatResults = searchContext('llm_utils_chat', 100, 500);
for (const r of utilsChatResults.slice(0, 10)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "LLMUtilsChat" ===');
const llmUtilsResults = searchContext('LLMUtilsChat', 100, 500);
for (const r of llmUtilsResults.slice(0, 10)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "ChatCompletion" ===');
const chatCompletionResults = searchContext('ChatCompletion', 100, 500);
for (const r of chatCompletionResults.slice(0, 10)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "scene_params" ===');
const sceneParamsResults = searchContext('scene_params', 50, 300);
for (const r of sceneParamsResults.slice(0, 5)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "/api/agent/v3/" endpoints ===');
const agentV3Results = searchContext('/api/agent/v3/', 20, 200);
for (const r of agentV3Results.slice(0, 20)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}

console.log('\n=== Searching for "chat_completion" ===');
const chatCompResults = searchContext('chat_completion', 50, 300);
for (const r of chatCompResults.slice(0, 5)) {
  console.log(`Offset ${r.offset}:`);
  console.log(r.context);
  console.log('---');
}
