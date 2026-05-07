const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searches = [
  'ChatRequest',
  'ChatCompletionRequest',
  'SendMessagesRequest',
  'ChatMessage',
  'chat_completion',
  'chat_request',
  'SendChatRequest',
  'ModelChatRequest',
  'IdeChatRequest',
  'RawChatRequest',
  'LLMRawChatRequest',
  'ChatModeRequest',
];

for (const term of searches) {
  const tBytes = Buffer.from(term, 'utf8');
  let found = false;
  for (let i = 0; i < buffer.length - tBytes.length; i++) {
    let match = true;
    for (let j = 0; j < tBytes.length; j++) {
      if (buffer[i + j] !== tBytes[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      const start = Math.max(0, i - 50);
      const end = Math.min(buffer.length, i + term.length + 500);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`"${term}" at offset ${i}:`);
      console.log(context);
      console.log('\n');
      found = true;
      break;
    }
  }
  if (!found) {
    console.log(`"${term}": NOT FOUND\n`);
  }
}

console.log('\n=== Searching for "model_list" endpoint response structure ===');
const modelListTerm = 'ModelListResponse';
const mlBytes = Buffer.from(modelListTerm, 'utf8');
for (let i = 0; i < buffer.length - mlBytes.length; i++) {
  let match = true;
  for (let j = 0; j < mlBytes.length; j++) {
    if (buffer[i + j] !== mlBytes[j]) {
      match = false;
      break;
    }
  }
  if (match) {
    const start = Math.max(0, i - 50);
    const end = Math.min(buffer.length, i + modelListTerm.length + 1000);
    const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
    console.log(`"${modelListTerm}" at offset ${i}:`);
    console.log(context);
    console.log('\n');
    break;
  }
}
