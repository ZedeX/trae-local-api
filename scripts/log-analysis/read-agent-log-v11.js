const fs = require('fs');
const path = require('path');

const logsDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular';
const logFiles = fs.readdirSync(logsDir).filter(f => f.includes('ai-agent') && f.includes('stdout'));
const logFile = path.join(logsDir, logFiles[0]);

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 50 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('=== Searching for "TimingCost" events (successful requests) ===');
const timingLines = lines.filter(l => l.includes('TimingCost') && !l.includes('run_command'));
console.log(`Found ${timingLines.length} lines`);
for (const l of timingLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Searching for "send first token timing" events ===');
const firstTokenLines = lines.filter(l => l.includes('send first token timing') && !l.includes('run_command'));
console.log(`Found ${firstTokenLines.length} lines`);
for (const l of firstTokenLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Searching for "config_name" in request context ===');
const configNameLines = lines.filter(l => 
  l.includes('config_name') && 
  l.includes('create_agent') && 
  !l.includes('run_command')
);
console.log(`Found ${configNameLines.length} lines`);
for (const l of configNameLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "model_name" in request context ===');
const modelNameLines = lines.filter(l => 
  l.includes('model_name') && 
  l.includes('create_agent') && 
  !l.includes('run_command')
);
console.log(`Found ${modelNameLines.length} lines`);
for (const l of modelNameLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "current_config_info" in logs ===');
const currentConfigLines = lines.filter(l => 
  l.includes('current_config_info') && 
  !l.includes('run_command')
);
console.log(`Found ${currentConfigLines.length} lines`);
for (const l of currentConfigLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "prompt_len" or "prompt_length" ===');
const promptLenLines = lines.filter(l => 
  (l.includes('prompt_len') || l.includes('prompt_length')) && 
  !l.includes('run_command')
);
console.log(`Found ${promptLenLines.length} lines`);
for (const l of promptLenLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}
