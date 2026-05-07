const fs = require('fs');

const logFile = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular\\ai-agent_0_1778138694808_stdout.log';

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 10 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('=== Searching for "CreateAgentTaskRequest" or "create_agent_task" request body ===');
const reqLines = lines.filter(l => (l.includes('CreateAgentTaskRequest') || (l.includes('create_agent_task') && l.includes('req='))) && !l.includes('run_command') && !l.includes('RUN_CMD'));
for (const l of reqLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}

console.log('\n\n=== Searching for "req=" near "agent" ===');
const reqAgentLines = lines.filter(l => l.includes('req=') && l.includes('agent') && !l.includes('run_command') && !l.includes('RUN_CMD'));
for (const l of reqAgentLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}

console.log('\n\n=== Searching for "request url" with "create_agent_task" ===');
const urlLines = lines.filter(l => l.includes('request url') && l.includes('create_agent_task') && !l.includes('run_command'));
for (const l of urlLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n\n=== Searching for "HTTPClient" with "create_agent" ===');
const httpLines = lines.filter(l => l.includes('HTTPClient') && l.includes('create_agent') && !l.includes('run_command'));
for (const l of httpLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}
