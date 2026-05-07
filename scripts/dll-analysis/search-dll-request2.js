const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerm = 'CreateAgentTaskRequest';
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
    const end = Math.min(buffer.length, i + searchTerm.length + 2000);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`"${searchTerm}" at offset ${i}:`);
    console.log(context);
    console.log('\n\n');
  }
}

console.log('\n=== Searching for full CreateAgentTaskRequest struct fields ===');
const structSearch = 'session_idtask_idmessage_idconversation_iduser_iddevice_id';
const sBytes = Buffer.from(structSearch, 'utf8');
for (let i = 0; i < buffer.length - sBytes.length; i++) {
  let found = true;
  for (let j = 0; j < sBytes.length; j++) {
    if (buffer[i + j] !== sBytes[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    const start = Math.max(0, i - 100);
    const end = Math.min(buffer.length, i + structSearch.length + 3000);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`Found at offset ${i}:`);
    console.log(context);
    console.log('\n\n');
  }
}
