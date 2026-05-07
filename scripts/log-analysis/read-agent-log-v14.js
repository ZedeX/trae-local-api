const fs = require('fs');
const path = require('path');

const logFile = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular\\ai-agent_0_1778138694808_stdout.log';
const stat = fs.statSync(logFile);
const readSize = Math.min(stat.size, 20 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);
const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, 0);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('=== Searching for "model_list" request details ===');
const modelLines = lines.filter(l => 
  l.includes('model_list') && 
  !l.includes('History') &&
  !l.includes('run_command')
);
console.log(`Found ${modelLines.length} lines`);
for (const l of modelLines.slice(0, 10)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "get_detail_param" request details ===');
const detailLines = lines.filter(l => 
  l.includes('get_detail_param') && 
  !l.includes('History') &&
  !l.includes('run_command')
);
console.log(`Found ${detailLines.length} lines`);
for (const l of detailLines.slice(0, 10)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "chat_mode" request details ===');
const chatModeLines = lines.filter(l => 
  l.includes('chat_mode') && 
  !l.includes('History') &&
  !l.includes('run_command')
);
console.log(`Found ${chatModeLines.length} lines`);
for (const l of chatModeLines.slice(0, 10)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "config_info" in logs ===');
const configLines = lines.filter(l => 
  l.includes('config_info') && 
  !l.includes('History') &&
  !l.includes('run_command') &&
  l.length < 2000
);
console.log(`Found ${configLines.length} lines`);
for (const l of configLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}
