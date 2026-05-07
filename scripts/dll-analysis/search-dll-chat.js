const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerm = 'api/ide/v1/chat';
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
    const start = Math.max(0, i - 200);
    const end = Math.min(buffer.length, i + searchTerm.length + 1000);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`"${searchTerm}" at offset ${i}:`);
    console.log(context);
    console.log('\n\n');
  }
}

console.log('\n=== Searching for "ChatCompletionRequest" ===');
const searchTerm2 = 'ChatCompletionRequest';
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
    const start = Math.max(0, i - 100);
    const end = Math.min(buffer.length, i + searchTerm2.length + 1000);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`"${searchTerm2}" at offset ${i}:`);
    console.log(context);
    console.log('\n\n');
    break;
  }
}

console.log('\n=== Searching for "ModelConnect" request fields ===');
const searchTerm3 = 'ModelConnectRequest';
const tBytes3 = Buffer.from(searchTerm3, 'utf8');
for (let i = 0; i < buffer.length - tBytes3.length; i++) {
  let found = true;
  for (let j = 0; j < tBytes3.length; j++) {
    if (buffer[i + j] !== tBytes3[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    const start = Math.max(0, i - 50);
    const end = Math.min(buffer.length, i + searchTerm3.length + 1000);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`"${searchTerm3}" at offset ${i}:`);
    console.log(context);
    console.log('\n\n');
    break;
  }
}
