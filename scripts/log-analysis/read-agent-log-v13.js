const fs = require('fs');
const path = require('path');

const logDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs';
const files = fs.readdirSync(logDir).filter(f => f.startsWith('ai-agent') && f.endsWith('.log')).sort();
const latestLog = path.join(logDir, files[files.length - 1]);
console.log('Reading:', latestLog);

const content = fs.readFileSync(latestLog, 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);

console.log('\n=== Recent /api/ide/v1/chat requests (last 3) ===');
const chatLines = lines.filter(l => l.includes('/api/ide/v1/chat') && l.includes('request'));
let count = 0;
for (let i = chatLines.length - 1; i >= 0 && count < 3; i--) {
  console.log(chatLines[i].substring(0, Math.min(chatLines[i].length, 3000)));
  console.log('---');
  count++;
}

console.log('\n=== Recent SSE events with actual content (not error 4011) ===');
const sseLines = lines.filter(l => 
  (l.includes('event:') || l.includes('data:')) && 
  !l.includes('4011') && 
  !l.includes('rate limit')
);
for (const l of sseLines.slice(-10)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Recent successful chat completions ===');
const successLines = lines.filter(l => 
  l.includes('chat_completion') || 
  l.includes('ChatCompletion') ||
  (l.includes('finish_reason') && !l.includes('4011'))
);
for (const l of successLines.slice(-5)) {
  console.log(l.substring(0, Math.min(l.length, 1000)));
  console.log('---');
}

console.log('\n=== Recent TimingCost events ===');
const timingLines = lines.filter(l => l.includes('TimingCost'));
for (const l of timingLines.slice(-5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}

console.log('\n=== Last 50 lines of log ===');
for (const l of lines.slice(-50)) {
  if (l.trim()) {
    console.log(l.substring(0, Math.min(l.length, 300)));
  }
}
