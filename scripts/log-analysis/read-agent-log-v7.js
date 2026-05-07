const fs = require('fs');

const logFile = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular\\ai-agent_0_1778138694808_stdout.log';

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 30 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('=== Searching for AhaNetHTTPClient with "create_agent_task" URL ===');
const ahaCreateLines = lines.filter(l => l.includes('AhaNetHTTPClient') && l.includes('create_agent_task') && !l.includes('run_command'));
console.log(`Found ${ahaCreateLines.length} lines`);
for (const l of ahaCreateLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 3000)));
  console.log('---');
}

console.log('\n\n=== Searching for "add_header" with "create_agent" ===');
const headerLines = lines.filter(l => l.includes('add_header') && l.includes('create_agent') && !l.includes('run_command'));
console.log(`Found ${headerLines.length} lines`);
for (const l of headerLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 3000)));
  console.log('---');
}

console.log('\n\n=== Searching for "request url" with "agent/v3" ===');
const agentUrlLines = lines.filter(l => l.includes('request url') && l.includes('agent/v3') && !l.includes('run_command'));
console.log(`Found ${agentUrlLines.length} lines`);
for (const l of agentUrlLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 3000)));
  console.log('---');
}

console.log('\n\n=== Searching for "add_header" near "agent" ===');
const addHeaderAgentLines = lines.filter(l => l.includes('add_header') && l.includes('agent') && !l.includes('get_detail') && !l.includes('run_command'));
console.log(`Found ${addHeaderAgentLines.length} lines`);
for (const l of addHeaderAgentLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 3000)));
  console.log('---');
}
