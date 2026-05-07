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

console.log('=== Searching for TimingCost (successful request indicator) ===');
const timingLines = lines.filter(l =>
  l.includes('TimingCost') &&
  !l.includes('History')
);
console.log(`Found ${timingLines.length} lines`);
for (const l of timingLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Searching for SSE data events ===');
const sseLines = lines.filter(l =>
  (l.includes('data:') || l.includes('event:')) &&
  l.includes('create_agent_task') === false &&
  !l.includes('History') &&
  l.length < 500
);
console.log(`Found ${sseLines.length} lines`);
for (const l of sseLines.slice(0, 10)) {
  console.log(l.substring(0, Math.min(l.length, 300)));
  console.log('---');
}

console.log('\n=== Searching for "do_create_cloud_agent_task" with request body ===');
const createTaskLines = lines.filter(l =>
  l.includes('do_create_cloud_agent_task') &&
  !l.includes('History') &&
  !l.includes('failed')
);
console.log(`Found ${createTaskLines.length} lines`);
for (const l of createTaskLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Searching for "send_request" or "http_request" ===');
const reqLines = lines.filter(l =>
  (l.includes('send_request') || l.includes('http_request') || l.includes('POST /api')) &&
  !l.includes('History') &&
  l.length < 2000
);
console.log(`Found ${reqLines.length} lines`);
for (const l of reqLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for "session_id" near "create_agent_task" ===');
const sessionLines = lines.filter(l =>
  l.includes('session_id') &&
  l.includes('create_agent_task') &&
  !l.includes('History')
);
console.log(`Found ${sessionLines.length} lines`);
for (const l of sessionLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Searching for "request_id" or "req_id" in request context ===');
const reqIdLines = lines.filter(l =>
  (l.includes('request_id') || l.includes('req_id')) &&
  l.includes('agent') &&
  !l.includes('History') &&
  l.length < 2000
);
console.log(`Found ${reqIdLines.length} lines`);
for (const l of reqIdLines.slice(0, 3)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Searching for successful SSE stream start ===');
const streamStartLines = lines.filter(l =>
  (l.includes('stream_start') || l.includes('start_stream') || l.includes('SSE') || l.includes('event-stream')) &&
  !l.includes('History') &&
  l.length < 2000
);
console.log(`Found ${streamStartLines.length} lines`);
for (const l of streamStartLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Last 50 non-empty lines (most recent activity) ===');
const nonEmpty = lines.filter(l => l.trim().length > 0);
for (const l of nonEmpty.slice(-50)) {
  console.log(l.substring(0, Math.min(l.length, 300)));
}
