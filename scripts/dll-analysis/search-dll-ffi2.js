const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'init_aha_ffi_server',
  'BP_Initialize called',
  'BP_Initialize completed',
  'aha_ipc',
  'ipc_callback',
  'callback',
  'register_callback',
  'on_message',
  'on_event',
  'event_callback',
  'message_handler',
  'send_message',
  'send_ipc',
  'recv_ipc',
  'IpcChannel',
  'channel_id',
  'ffi_server',
  'FFIServer',
  'AhaFFI',
  'aha_ffi_server',
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
      const start = Math.max(0, i - 50);
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
