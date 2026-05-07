const fs = require('fs');
const path = require('path');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'summary_config_info',
  'SummaryConfigInfo',
  'summary_config',
  'summary_template',
  'CreateAgentTaskRequest',
  'create_agent_task',
  'config_opt',
  'summary_config_item',
];

for (const term of searchTerms) {
  const termBytes = Buffer.from(term, 'utf8');
  const positions = [];
  
  for (let i = 0; i < buffer.length - termBytes.length; i++) {
    let found = true;
    for (let j = 0; j < termBytes.length; j++) {
      if (buffer[i + j] !== termBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      const start = Math.max(0, i - 80);
      const end = Math.min(buffer.length, i + termBytes.length + 200);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      positions.push({ offset: i, context });
    }
  }
  
  console.log(`\n=== "${term}" found ${positions.length} times ===`);
  for (const pos of positions.slice(0, 5)) {
    console.log(`  Offset ${pos.offset}: ...${pos.context}...`);
  }
}
