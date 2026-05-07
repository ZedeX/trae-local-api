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

console.log('=== Searching for AhaNetHTTPClient with create_agent_task ===');
const ahaLines = lines.filter(l => l.includes('AhaNetHTTPClient') && l.includes('create_agent_task') && !l.includes('run_command'));
for (const l of ahaLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n\n=== Searching for "simple_service_v2" with request body ===');
const svcLines = lines.filter(l => l.includes('simple_service_v2') && l.includes('req=') && !l.includes('run_command'));
for (const l of svcLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n\n=== Searching for "send_request" or "post_request" ===');
const postLines = lines.filter(l => (l.includes('send_request') || l.includes('post_request')) && l.includes('agent') && !l.includes('run_command'));
for (const l of postLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}

console.log('\n\n=== Searching for "config_opt" or "ConfigOpt" ===');
const optLines = lines.filter(l => (l.includes('config_opt') || l.includes('ConfigOpt')) && !l.includes('run_command'));
for (const l of optLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}

console.log('\n\n=== Searching for "summary_config_info" ===');
const sciLines = lines.filter(l => l.includes('summary_config_info') && !l.includes('run_command'));
for (const l of sciLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1500)));
  console.log('---');
}
