const fs = require('fs');
const path = require('path');

const logsDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs';

const dirs = fs.readdirSync(logsDir).filter(d => {
  const full = path.join(logsDir, d);
  return fs.statSync(full).isDirectory();
}).sort();

console.log('Available log directories:');
for (const d of dirs.slice(-5)) {
  console.log(' ', d);
}

const latestDir = dirs[dirs.length - 1];
const modularDir = path.join(logsDir, latestDir, 'Modular');

if (!fs.existsSync(modularDir)) {
  console.log('No Modular directory in latest logs');
  process.exit(1);
}

const logFiles = fs.readdirSync(modularDir).filter(f => f.includes('ai-agent'));
console.log('\nai-agent log files:');
for (const f of logFiles) {
  const full = path.join(modularDir, f);
  const stat = fs.statSync(full);
  console.log(`  ${f} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
}

const logFile = path.join(modularDir, logFiles.find(f => f.includes('stdout')) || logFiles[0]);
console.log('\nAnalyzing:', logFile);

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 50 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

console.log('\n=== Searching for "request body" or "req_body" or "body=" ===');
const bodyLines = lines.filter(l => 
  (l.includes('request_body') || l.includes('req_body') || l.includes('body=') || l.includes('Request body')) && 
  l.includes('agent') && 
  !l.includes('run_command')
);
console.log(`Found ${bodyLines.length} lines`);
for (const l of bodyLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "create_agent_task" with request details ===');
const createLines = lines.filter(l => 
  l.includes('create_agent_task') && 
  !l.includes('run_command') && 
  !l.includes('History') &&
  (l.includes('param') || l.includes('body') || l.includes('req') || l.includes('session_id'))
);
console.log(`Found ${createLines.length} lines`);
for (const l of createLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "do_create_cloud_agent_task" ===');
const doCreateLines = lines.filter(l => 
  l.includes('do_create_cloud_agent_task') && 
  !l.includes('run_command')
);
console.log(`Found ${doCreateLines.length} lines`);
for (const l of doCreateLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "summary_config" in logs ===');
const summaryLines = lines.filter(l => 
  l.includes('summary_config') && 
  !l.includes('run_command')
);
console.log(`Found ${summaryLines.length} lines`);
for (const l of summaryLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "config_opt" in logs ===');
const configOptLines = lines.filter(l => 
  l.includes('config_opt') && 
  !l.includes('run_command')
);
console.log(`Found ${configOptLines.length} lines`);
for (const l of configOptLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}
