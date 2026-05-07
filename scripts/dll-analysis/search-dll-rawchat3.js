const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerm = 'struct LLMRawChatRequest';
const tBytes = Buffer.from(searchTerm, 'utf8');

for (let i = 0; i < buffer.length - tBytes.length; i++) {
  let found = true;
  for (let j = 0; j < tBytes.length; j++) {
    if (buffer[i + j] !== tBytes[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    const start = Math.max(0, i - 100);
    const end = Math.min(buffer.length, i + searchTerm.length + 2000);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`"${searchTerm}" at offset ${i}:`);
    console.log(context);
    console.log('\n\n');
  }
}

console.log('\n=== Searching for "scene_params" context ===');
const searchTerm2 = 'scene_params';
const tBytes2 = Buffer.from(searchTerm2, 'utf8');
for (let i = 0; i < buffer.length - tBytes2.length; i++) {
  let found = true;
  for (let j = 0; j < tBytes2.length; j++) {
    if (buffer[i + j] !== tBytes2[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    const start = Math.max(0, i - 200);
    const end = Math.min(buffer.length, i + searchTerm2.length + 500);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`"${searchTerm2}" at offset ${i}:`);
    console.log(context);
    console.log('\n\n');
    break;
  }
}

console.log('\n=== Searching for "llm_raw_chat" with request/response ===');
const searchTerm3 = 'llm_raw_chat';
const tBytes3 = Buffer.from(searchTerm3, 'utf8');
let count = 0;
for (let i = 0; i < buffer.length - tBytes3.length; i++) {
  let found = true;
  for (let j = 0; j < tBytes3.length; j++) {
    if (buffer[i + j] !== tBytes3[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    count++;
    if (count <= 5) {
      const start = Math.max(0, i - 200);
      const end = Math.min(buffer.length, i + searchTerm3.length + 500);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`"${searchTerm3}" (#${count}) at offset ${i}:`);
      console.log(context);
      console.log('\n\n');
    }
  }
}
