const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'CreateAgentTaskRequest',
  'available_tool_list',
  'mcp_tool',
  'custom_agent',
  'agent_dsl',
  'tunnel_id',
  'missing_history',
  'agent_version',
  'ab_info',
  'skill_list',
  'mcp_folder',
  'custom_subagent',
];

for (const term of searchTerms) {
  const termBytes = Buffer.from(term, 'utf8');
  
  for (let i = 0; i < buffer.length - termBytes.length; i++) {
    let found = true;
    for (let j = 0; j < termBytes.length; j++) {
      if (buffer[i + j] !== termBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      const start = Math.max(0, i - 200);
      const end = Math.min(buffer.length, i + termBytes.length + 500);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`\n=== "${term}" at offset ${i} ===`);
      console.log(context);
    }
  }
}
