// Test tool_use support for various models via streaming
const tc = require('./src/trae-client');

async function testToolUse(configName, label) {
  console.log(`\n=== Testing ${label} (${configName}) ===`);
  try {
    const messages = [{
      role: 'user',
      content: 'List the files in the current directory. You must use the Bash tool to do this. Output a toolcall block.'
    }];

    const result = await tc.llmUtilsChat(messages, configName, true, {
      function: 'chat_v3',
      tools: [{
        type: 'function',
        function: {
          name: 'Bash',
          description: 'Execute a bash command',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'The command to execute' }
            },
            required: ['command']
          }
        }
      }]
    });

    let fullContent = '';
    let fullReasoning = '';
    let toolCallChunks = 0;

    await new Promise((resolve, reject) => {
      let buffer = '';
      result.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'text') {
                if (parsed.content) fullContent += parsed.content;
                if (parsed.reasoning) fullReasoning += parsed.reasoning;
              }
              if (parsed.type === 'tool_use' || parsed.type === 'tool_call' || parsed.tool_calls) {
                toolCallChunks++;
              }
            } catch (e) {}
          }
        }
      });
      result.body.on('end', resolve);
      result.body.on('error', reject);
    });

    const hasToolcallTag = fullContent.includes('<toolcall');
    const hasToolCallType = toolCallChunks > 0;
    const supportsToolUse = hasToolcallTag || hasToolCallType;

    console.log(`  Content length: ${fullContent.length}`);
    console.log(`  Reasoning length: ${fullReasoning.length}`);
    console.log(`  Tool call chunks (structured): ${toolCallChunks}`);
    console.log(`  Has <toolcall> tag in content: ${hasToolcallTag}`);
    console.log(`  Supports tool_use: ${supportsToolUse ? 'YES' : 'NO'}`);
    console.log(`  Content preview: ${fullContent.substring(0, 400).replace(/\n/g, ' ')}`);
    return { configName, supportsToolUse, fullContent };
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
    return { configName, error: e.message };
  }
}

(async () => {
  const results = [];

  // Test key models
  results.push(await testToolUse('DeepSeek-V4-Pro', 'DeepSeek V4 Pro'));
  results.push(await testToolUse('glm-5.2', 'GLM-5.2'));
  results.push(await testToolUse('qwen-3.7-plus', 'Qwen-3.7-Plus'));
  results.push(await testToolUse('minimax-m3', 'MiniMax-M3'));

  console.log('\n=== SUMMARY ===');
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.configName}: ERROR - ${r.error}`);
    } else {
      console.log(`  ${r.configName}: tool_use=${r.supportsToolUse ? 'YES' : 'NO'}`);
    }
  }

  process.exit(0);
})();
