const fs = require('fs');
const path = require('path');

const logFile = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs\\20260507T152454\\Modular\\ai-agent_0_1778138694808_stdout.log';

const stat = fs.statSync(logFile);
const fileSize = stat.size;
const readSize = Math.min(fileSize, 5 * 1024 * 1024);
const buffer = Buffer.alloc(readSize);

const fd = fs.openSync(logFile, 'r');
fs.readSync(fd, buffer, 0, readSize, fileSize - readSize);
fs.closeSync(fd);

const text = buffer.toString('utf8');
const lines = text.split('\n');

const searchTerms = ['agentic_summary_config', 'DymanicAgenticSummaryConfig', 'summary_message_token_limit', 'DynamicConfigData'];

for (const term of searchTerms) {
  const matches = lines.filter(l => l.includes(term));
  console.log(`\n=== "${term}" found ${matches.length} lines ===`);
  for (const m of matches.slice(0, 2)) {
    const idx = m.indexOf(term);
    const start = Math.max(0, idx - 50);
    const end = Math.min(m.length, idx + 300);
    console.log(m.substring(start, end));
    console.log('---');
  }
}

console.log('\n\n=== Searching for "start create agent task" ===');
const startLines = lines.filter(l => l.includes('start create agent task'));
for (const l of startLines.slice(0, 3)) {
  const idx = l.indexOf('start create agent task');
  console.log(l.substring(Math.max(0, idx - 100), Math.min(l.length, idx + 500)));
  console.log('---');
}

console.log('\n\n=== Searching for "config_name" near "summary" ===');
const summaryLines = lines.filter(l => l.includes('summary') && l.includes('config_name'));
for (const l of summaryLines.slice(0, 5)) {
  console.log(l.substring(0, Math.min(l.length, 500)));
  console.log('---');
}
