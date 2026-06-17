// Test tool_use support for models via streaming
// Correctly parses Trae SSE format: event:output with response/reasoning_content fields
const tc = require('./src/trae-client');

// Build the same tool system message that server.js injects
function buildToolSystemMsg(tools) {
  const toolDescriptions = tools.map(t => {
    const params = t.input_schema?.properties ? Object.keys(t.input_schema.properties).join(', ') : '';
    return `- ${t.name}(${params}): ${t.description?.substring(0, 200) || ''}`;
  }).join('\n');

  return `<available_tools>
You have access to the following tools. To call a tool, output a toolcall block in JSON format:
<toolcall>{"name": "ToolName", "params": {"param1": "value1"}}</toolcall>

CRITICAL RULES:
- The <toolcall> block MUST contain valid JSON with "name" and "params" keys
- Use the EXACT tool names listed below (case-sensitive)
- Output the <toolcall> block directly in your response

Available tools:
${toolDescriptions}
</available_tools>`;
}

const TOOLS = [{
  name: 'Bash',
  description: 'Execute a bash command and return its output.',
  input_schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to execute' }
    },
    required: ['command']
  }
}];

const TOOL_SYSTEM_MSG = buildToolSystemMsg(TOOLS);

async function testToolUse(configName) {
  try {
    const messages = [
      { role: 'system', content: TOOL_SYSTEM_MSG },
      { role: 'user', content: 'List the files in the current directory. You must use the Bash tool to do this.' }
    ];

    const result = await tc.llmUtilsChat(messages, configName, true, {
      function: 'chat_v3'
    });

    let fullContent = '';
    let fullReasoning = '';

    await new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => reject(new Error('Stream timeout 120s')), 120000);

      result.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          // Handle both "data: " and "data:" formats
          let data = null;
          if (line.startsWith('data: ')) data = line.substring(6).trim();
          else if (line.startsWith('data:')) data = line.substring(5).trim();
          if (data === null) continue;
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            // Trae SSE format: event:output -> data has "response" and "reasoning_content"
            if (parsed.response) fullContent += parsed.response;
            if (parsed.reasoning_content) fullReasoning += parsed.reasoning_content;
          } catch (e) {}
        }
      });
      result.body.on('end', () => { clearTimeout(timeout); resolve(); });
      result.body.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });

    const hasToolcallTag = /<toolcall[\s>]/i.test(fullContent);
    return {
      contentLen: fullContent.length,
      reasoningLen: fullReasoning.length,
      hasToolcallTag,
      supportsToolUse: hasToolcallTag,
      preview: fullContent.substring(0, 400).replace(/\n/g, ' ')
    };
  } catch (e) {
    return { error: e.message };
  }
}

(async () => {
  const models = process.argv.slice(2);
  if (models.length === 0) {
    models.push('DeepSeek-V4-Pro', 'DeepSeek-V4-Flash', 'glm-5.2');
  }

  console.log(`=== ToolUse Test: ${models.join(', ')} ===`);
  for (const m of models) {
    process.stdout.write(`  ${m} ...`);
    const r = await testToolUse(m);
    if (r.error) {
      console.log(` ERROR: ${r.error}`);
    } else {
      console.log(` len=${r.contentLen} reasoning=${r.reasoningLen} toolcall=${r.hasToolcallTag} => ${r.supportsToolUse ? 'YES' : 'NO'}`);
      if (r.contentLen > 0) console.log(`    preview: ${r.preview}`);
    }
  }
  process.exit(0);
})();
