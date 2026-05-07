const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

function extractFieldsAround(offset, radius, label) {
  const start = offset;
  const end = Math.min(buffer.length, offset + radius);
  const chunk = buffer.slice(start, end);
  
  const fields = [];
  let currentField = '';
  for (let k = 0; k < chunk.length; k++) {
    const byte = chunk[k];
    if (byte >= 0x20 && byte <= 0x7e) {
      currentField += String.fromCharCode(byte);
    } else {
      if (currentField.length > 2 && currentField.length < 80) {
        fields.push(currentField);
      }
      currentField = '';
    }
  }
  
  console.log(`\n=== ${label} ===`);
  for (const f of fields) {
    console.log(`  ${f}`);
  }
}

const searchTerm = 'agentic_summary_config';
const termBytes = Buffer.from(searchTerm, 'utf8');

for (let i = 0; i < buffer.length - termBytes.length; i++) {
  let found = true;
  for (let j = 0; j < termBytes.length; j++) {
    if (buffer[i + j] !== termBytes[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    extractFieldsAround(i, 300, 'Fields after agentic_summary_config');
  }
}

const searchTerms2 = [
  'AgenticSummaryConfig',
  'agentic_summary',
  'SummaryConfig',
  'summary_config_item',
  'get_summary_config',
  'failed to get summary',
  'summary template',
  'SummaryTemplate',
  'summary_template_data',
];

for (const term of searchTerms2) {
  const tBytes = Buffer.from(term, 'utf8');
  for (let i = 0; i < buffer.length - tBytes.length; i++) {
    let found = true;
    for (let j = 0; j < tBytes.length; j++) {
      if (buffer[i + j] !== tBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      const start = Math.max(0, i - 100);
      const end = Math.min(buffer.length, i + term.length + 300);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`\n"${term}" at offset ${i}:`);
      console.log(context);
    }
  }
}

console.log('\n\n=== Searching for "failed to get summary" ===');
const failTerm = 'failed to get summary';
const failBytes = Buffer.from(failTerm, 'utf8');
for (let i = 0; i < buffer.length - failBytes.length; i++) {
  let found = true;
  for (let j = 0; j < failBytes.length; j++) {
    if (buffer[i + j] !== failBytes[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    const start = Math.max(0, i - 200);
    const end = Math.min(buffer.length, i + failBytes.length + 300);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`At offset ${i}:`);
    console.log(context);
  }
}
