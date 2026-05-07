const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'CreateAgentTaskRequest',
  'CreateAgentTaskExtraConfig',
  'CompactRequest',
  'DymanicAgenticSummaryConfig',
  'DynamicAgenticSummaryConfig',
  'summary_config_info',
  'config_opt',
  'tunnel_id',
  'missing_history',
  'available_tool',
  'agent_dsl',
  'agent_static_dsl',
  'mcp_folder',
  'cached_tool_group',
  'history_message_limit',
  'raw_rules',
  'enterprise_custom',
  'additional_instruction',
  'disable_parallel',
  'enable_core_memory',
  'enable_ask_user',
  'enable_init_command',
  'ab_info',
  'skill_list',
  'custom_subagent',
  'custom_agent',
  'mcp_tool',
  'access_type',
  'agent_version',
  'context_batch',
  'poly_prompt',
  'prompt_template',
  'prompt_data',
  'tool_list',
  'extra_info',
  'extra_config',
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
      if (count <= 1) {
        const start = Math.max(0, i - 30);
        const end = Math.min(buffer.length, i + term.length + 500);
        const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
        console.log(`\n"${term}" at offset ${i}:`);
        console.log(context);
      }
      if (count >= 1) break;
    }
  }
  if (count === 0) {
    console.log(`\n"${term}": NOT FOUND`);
  }
}
