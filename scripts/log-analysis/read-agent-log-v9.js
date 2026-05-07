const fs = require('fs');
const path = require('path');

const logsDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular';

const logFiles = fs.readdirSync(logsDir).filter(f => f.includes('ai-agent'));
console.log('ai-agent log files:');
for (const f of logFiles) {
  const full = path.join(logsDir, f);
  const stat = fs.statSync(full);
  console.log(`  ${f} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
}

const logFile = path.join(logsDir, logFiles.find(f => f.includes('stdout')) || logFiles[0]);
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

console.log('\n=== Searching for "CreateAgentTaskRequest" ===');
const createReqLines = lines.filter(l => 
  l.includes('CreateAgentTaskRequest') && 
  !l.includes('run_command')
);
console.log(`Found ${createReqLines.length} lines`);
for (const l of createReqLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "call_server_generate" with body ===');
const callServerLines = lines.filter(l => 
  l.includes('call_server_generate') && 
  !l.includes('run_command')
);
console.log(`Found ${callServerLines.length} lines`);
for (const l of callServerLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "encrypted_model_params" ===');
const encModelLines = lines.filter(l => 
  l.includes('encrypted_model_params') && 
  !l.includes('run_command')
);
console.log(`Found ${encModelLines.length} lines`);
for (const l of encModelLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}
