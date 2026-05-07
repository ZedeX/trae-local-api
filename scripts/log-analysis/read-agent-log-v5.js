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

console.log('=== Searching for "AhaNet" with "create_agent" ===');
const ahaCreateLines = lines.filter(l => l.includes('AhaNet') && l.includes('create_agent') && !l.includes('run_command'));
console.log(`Found ${ahaCreateLines.length} lines`);
for (const l of ahaCreateLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n\n=== Searching for "request url" with "agent" ===');
const urlAgentLines = lines.filter(l => l.includes('request url') && l.includes('agent') && !l.includes('get_detail') && !l.includes('run_command'));
console.log(`Found ${urlAgentLines.length} lines`);
for (const l of urlAgentLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n\n=== Searching for "start create agent task" ===');
const startLines = lines.filter(l => l.includes('start create agent task') && !l.includes('run_command'));
console.log(`Found ${startLines.length} lines`);
for (const l of startLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n\n=== Searching for "do_create_cloud_agent_task" with body or req ===');
const doCreateLines = lines.filter(l => l.includes('do_create_cloud_agent_task') && (l.includes('body=') || l.includes('req=')) && !l.includes('run_command'));
console.log(`Found ${doCreateLines.length} lines`);
for (const l of doCreateLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}
