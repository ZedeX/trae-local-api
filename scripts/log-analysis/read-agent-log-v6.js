const fs = require('fs');

const logFile = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular\\ai-agent_0_1778138694808_stdout.log';

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 20 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('=== Searching for "process_ipc_request" with chat params ===');
const ipcLines = lines.filter(l => l.includes('process_ipc_request') && l.includes('chat') && !l.includes('run_command') && !l.includes('History'));
console.log(`Found ${ipcLines.length} lines`);
for (const l of ipcLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}

console.log('\n\n=== Searching for "do_chat" with params ===');
const chatLines = lines.filter(l => l.includes('do_chat') && (l.includes('param') || l.includes('req=')) && !l.includes('run_command') && !l.includes('History'));
console.log(`Found ${chatLines.length} lines`);
for (const l of chatLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}

console.log('\n\n=== Searching for "route:chat" with request info ===');
const routeLines = lines.filter(l => l.includes('route:chat') && !l.includes('run_command') && !l.includes('History') && !l.includes('toolcall'));
console.log(`Found ${routeLines.length} lines`);
for (const l of routeLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}

console.log('\n\n=== Searching for "chat_request" or "ChatRequest" ===');
const chatReqLines = lines.filter(l => (l.includes('chat_request') || l.includes('ChatRequest')) && !l.includes('run_command'));
console.log(`Found ${chatReqLines.length} lines`);
for (const l of chatReqLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}
