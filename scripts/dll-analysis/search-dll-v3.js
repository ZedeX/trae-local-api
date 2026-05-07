const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerm = 'CreateAgentTaskRequest';
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
    const start = i;
    const end = Math.min(buffer.length, i + 2000);
    const chunk = buffer.slice(start, end);
    
    const fields = [];
    let currentField = '';
    for (let k = searchTerm.length; k < chunk.length; k++) {
      const byte = chunk[k];
      if (byte >= 0x20 && byte <= 0x7e) {
        currentField += String.fromCharCode(byte);
      } else {
        if (currentField.length > 1 && currentField.length < 80) {
          fields.push(currentField);
        }
        currentField = '';
      }
    }
    
    console.log('=== CreateAgentTaskRequest fields ===');
    for (const f of fields) {
      console.log(`  - ${f}`);
    }
    break;
  }
}

console.log('\n\n=== Searching for summary-related fields ===');
const summarySearches = ['agentic_summary_config', 'summary_config', 'summary_template', 'summary_prompt'];
for (const term of summarySearches) {
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
      const start = Math.max(0, i - 300);
      const end = Math.min(buffer.length, i + term.length + 500);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`\n"${term}" at offset ${i}:`);
      console.log(context);
    }
  }
}

console.log('\n\n=== Searching for CreateAgentTaskExtraConfig fields ===');
const extraSearchTerm = 'CreateAgentTaskExtraConfig';
const extraBytes = Buffer.from(extraSearchTerm, 'utf8');
for (let i = 0; i < buffer.length - extraBytes.length; i++) {
  let found = true;
  for (let j = 0; j < extraBytes.length; j++) {
    if (buffer[i + j] !== extraBytes[j]) {
      found = false;
      break;
    }
  }
  if (found) {
    const start = i;
    const end = Math.min(buffer.length, i + 1500);
    const chunk = buffer.slice(start, end);
    
    const fields = [];
    let currentField = '';
    for (let k = extraSearchTerm.length; k < chunk.length; k++) {
      const byte = chunk[k];
      if (byte >= 0x20 && byte <= 0x7e) {
        currentField += String.fromCharCode(byte);
      } else {
        if (currentField.length > 1 && currentField.length < 80) {
          fields.push(currentField);
        }
        currentField = '';
      }
    }
    
    console.log('CreateAgentTaskExtraConfig fields:');
    for (const f of fields) {
      console.log(`  - ${f}`);
    }
    break;
  }
}
