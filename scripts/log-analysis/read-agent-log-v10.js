const fs = require('fs');
const path = require('path');

const logsDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular';
const logFiles = fs.readdirSync(logsDir).filter(f => f.includes('ai-agent') && f.includes('stdout'));
const logFile = path.join(logsDir, logFiles[0]);

console.log('Analyzing:', logFile);

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 50 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('\n=== Searching for "CreateAgentTaskRequest" ===');
const createReqLines = lines.filter(l => 
  l.includes('CreateAgentTaskRequest') && 
  !l.includes('run_command')
);
console.log(`Found ${createReqLines.length} lines`);
for (const l of createReqLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 5000)));
  console.log('---');
}

console.log('\n=== Searching for "call_server_generate_plan_item" with session/task/message ===');
const callServerLines = lines.filter(l => 
  l.includes('call_server_generate_plan_item') && 
  l.includes('session_id') &&
  !l.includes('History') &&
  !l.includes('run_command')
);
console.log(`Found ${callServerLines.length} lines`);
for (const l of callServerLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 5000)));
  console.log('---');
}

console.log('\n=== Searching for "Body keys" in logs ===');
const bodyKeysLines = lines.filter(l => 
  l.includes('Body keys') && 
  !l.includes('run_command')
);
console.log(`Found ${bodyKeysLines.length} lines`);
for (const l of bodyKeysLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "tunnel_id" in logs ===');
const tunnelLines = lines.filter(l => 
  l.includes('tunnel_id') && 
  !l.includes('run_command')
);
console.log(`Found ${tunnelLines.length} lines`);
for (const l of tunnelLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "missing_history" or "available_tools" in logs ===');
const historyToolsLines = lines.filter(l => 
  (l.includes('missing_history') || l.includes('available_tools') || l.includes('tool_list')) && 
  !l.includes('run_command') &&
  l.includes('agent')
);
console.log(`Found ${historyToolsLines.length} lines`);
for (const l of historyToolsLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "prompt" with "system" in agent context ===');
const promptLines = lines.filter(l => 
  l.includes('prompt') && 
  l.includes('system') && 
  l.includes('agent') &&
  !l.includes('run_command') &&
  !l.includes('History') &&
  !l.includes('toolcall')
);
console.log(`Found ${promptLines.length} lines`);
for (const l of promptLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}
