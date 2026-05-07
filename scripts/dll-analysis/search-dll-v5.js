const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'failed to get summary config',
  'summary config item is empty',
  'summary template data',
  'get_summary_config',
  'get_summary_template',
  'summary_config_info',
  'SummaryConfigInfo',
  'config item is empty',
  'config opt',
];

for (const term of searchTerms) {
  const tBytes = Buffer.from(term, 'utf8');
  let count = 0;
  for (let i = 0; i < buffer.length - tBytes.length; i++) {
    let found = true;
    for (let j = 0; j < tBytes.length; j++) {
      if (buffer[i + j] !== tBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      count++;
      const start = Math.max(0, i - 100);
      const end = Math.min(buffer.length, i + term.length + 300);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`\n"${term}" (#${count}) at offset ${i}:`);
      console.log(context);
      if (count >= 3) break;
    }
  }
  if (count === 0) {
    console.log(`\n"${term}": NOT FOUND`);
  }
}
