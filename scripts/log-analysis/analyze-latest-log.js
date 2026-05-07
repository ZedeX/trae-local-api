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

console.log('=== Searching for create_agent_task request body ===');
const taskLines = lines.filter(l =>
  l.includes('create_agent_task') &&
  !l.includes('History')
);
console.log(`Found ${taskLines.length} lines with create_agent_task`);
for (const l of taskLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 3000)));
  console.log('---');
}

console.log('\n=== Searching for "config_name" near "create_agent_task" ===');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('create_agent_task') && lines[i].includes('config_name')) {
    console.log(lines[i].substring(0, Math.min(lines[i].length, 3000)));
    console.log('---');
  }
}

console.log('\n=== Searching for "current_config_info" in logs ===');
const configInfoLines = lines.filter(l =>
  l.includes('current_config_info') &&
  !l.includes('History') &&
  l.length < 5000
);
console.log(`Found ${configInfoLines.length} lines`);
for (const l of configInfoLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 3000)));
  console.log('---');
}

console.log('\n=== Searching for "summary_config" in logs ===');
const summaryLines = lines.filter(l =>
  l.includes('summary_config') &&
  !l.includes('History')
);
console.log(`Found ${summaryLines.length} lines`);
for (const l of summaryLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "TimingCost" (successful request indicator) ===');
const timingLines = lines.filter(l =>
  l.includes('TimingCost') &&
  !l.includes('History')
);
console.log(`Found ${timingLines.length} lines`);
for (const l of timingLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Searching for "model config is empty" error ===');
const emptyLines = lines.filter(l =>
  l.includes('model config is empty') || l.includes('config item is empty')
);
console.log(`Found ${emptyLines.length} lines`);
for (const l of emptyLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "failed to get summary" error ===');
const failedSummaryLines = lines.filter(l =>
  l.includes('failed to get summary')
);
console.log(`Found ${failedSummaryLines.length} lines`);
for (const l of failedSummaryLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "rate limit" or "4011" ===');
const rateLines = lines.filter(l =>
  (l.includes('rate limit') || l.includes('4011')) &&
  !l.includes('History')
);
console.log(`Found ${rateLines.length} lines`);
for (const l of rateLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Searching for "extra_info" in logs ===');
const extraInfoLines = lines.filter(l =>
  l.includes('extra_info') &&
  !l.includes('History') &&
  l.length < 5000
);
console.log(`Found ${extraInfoLines.length} lines`);
for (const l of extraInfoLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}

console.log('\n=== Searching for "tool_list" or "tools" in request context ===');
const toolLines = lines.filter(l =>
  (l.includes('tool_list') || (l.includes('"tools"') && l.includes('create_agent'))) &&
  !l.includes('History') &&
  l.length < 5000
);
console.log(`Found ${toolLines.length} lines`);
for (const l of toolLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 2000)));
  console.log('---');
}
