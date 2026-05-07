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

console.log('=== Searching for "do_create_cloud_agent_task" ===');
const taskLines = lines.filter(l => l.includes('do_create_cloud_agent_task') && !l.includes('run_command'));
for (const l of taskLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 600)));
  console.log('---');
}

console.log('\n\n=== Searching for "call_server_generate" ===');
const serverLines = lines.filter(l => l.includes('call_server_generate') && !l.includes('run_command'));
for (const l of serverLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 600)));
  console.log('---');
}

console.log('\n\n=== Searching for "config_opt" or "ConfigOpt" ===');
const optLines = lines.filter(l => (l.includes('config_opt') || l.includes('ConfigOpt')) && !l.includes('run_command'));
for (const l of optLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 600)));
  console.log('---');
}

console.log('\n\n=== Searching for "summary template" ===');
const templateLines = lines.filter(l => l.includes('summary template') && !l.includes('run_command'));
for (const l of templateLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 600)));
  console.log('---');
}

console.log('\n\n=== Searching for "failed to get summary" ===');
const failLines = lines.filter(l => l.includes('failed to get summary') && !l.includes('run_command'));
for (const l of failLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 600)));
  console.log('---');
}

console.log('\n\n=== Searching for "enable_summary" ===');
const enableLines = lines.filter(l => l.includes('enable_summary') && !l.includes('run_command'));
for (const l of enableLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 600)));
  console.log('---');
}

console.log('\n\n=== Searching for "summary_config" in request body ===');
const scLines = lines.filter(l => l.includes('summary_config') && !l.includes('agentic_summary_config') && !l.includes('run_command'));
for (const l of scLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 600)));
  console.log('---');
}
