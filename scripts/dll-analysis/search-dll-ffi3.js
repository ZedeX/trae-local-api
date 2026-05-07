const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'ai_agent_ipc_init',
  'ai_agent_ipc_connect',
  'ai_agent_ipc_disconnect',
  'ai_agent_ipc_recv',
  'ai_agent_ipc_send',
  'BP_IPC_SERVER',
  'IpcSender',
  'IpcReceiver',
  'crossbeam_channel',
  'ipc_channel',
  'register_callback',
  'set_callback',
  'on_chat',
  'chat_callback',
  'response_callback',
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
      const start = Math.max(0, i - 80);
      const end = Math.min(buffer.length, i + term.length + 300);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`\n"${term}" (#${count}) at offset ${i}:`);
      console.log(context);
      if (count >= 2) break;
    }
  }
  if (count === 0) {
    console.log(`\n"${term}": NOT FOUND`);
  }
}
