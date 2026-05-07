const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  '/api/ide/v1/',
  '/api/agent/',
  'create_agent_task',
  'chat_completion',
  'simple_chat',
  'direct_chat',
  'chat_v3',
  'compact',
  'resume_agent',
  'get_detail_param',
  'get_model_detail',
  'model_list',
  'create_session',
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
      if (count <= 3) {
        const start = Math.max(0, i - 50);
        const end = Math.min(buffer.length, i + term.length + 200);
        const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
        console.log(`\n"${term}" (#${count}) at offset ${i}:`);
        console.log(context);
      }
    }
  }
  if (count === 0) {
    console.log(`\n"${term}": NOT FOUND`);
  } else {
    console.log(`\n  Total occurrences: ${count}`);
  }
}
