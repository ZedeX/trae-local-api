const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'llm_raw_chat',
  'LlmRawChatRequest',
  'RawChatRequest',
  'ChatRequest',
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
      const end = Math.min(buffer.length, i + term.length + 500);
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
