// Diagnostic test: dump raw stream data from DeepSeek models
const tc = require('./src/trae-client');

const TOOL_SYSTEM_MSG = `<available_tools>
You have access to the following tools. To call a tool, output a toolcall block in JSON format:
<toolcall>{"name": "ToolName", "params": {"param1": "value1"}}</toolcall>

Available tools:
- Bash(command): Execute a bash command and return its output.
</available_tools>`;

async function dumpRawStream(configName, label) {
  console.log(`\n========== ${label} (${configName}) ==========`);
  const messages = [
    { role: 'system', content: TOOL_SYSTEM_MSG },
    { role: 'user', content: 'List files in the current directory using the Bash tool.' }
  ];

  try {
    const result = await tc.llmUtilsChat(messages, configName, true, {
      function: 'chat_v3'
    });

    let rawLines = [];
    let fullContent = '';
    let byteCount = 0;

    await new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        console.log(`  [TIMEOUT after 90s]`);
        resolve();
      }, 90000);

      result.body.on('data', (chunk) => {
        const text = chunk.toString();
        byteCount += chunk.length;
        buffer += text;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            rawLines.push(line);
          }
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'text' && parsed.content) {
                fullContent += parsed.content;
              }
            } catch (e) {}
          }
        }
      });
      result.body.on('end', () => { clearTimeout(timeout); resolve(); });
      result.body.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });

    console.log(`  Total bytes: ${byteCount}`);
    console.log(`  Total raw lines: ${rawLines.length}`);
    console.log(`  Content length: ${fullContent.length}`);
    console.log(`  --- First 30 raw lines ---`);
    for (let i = 0; i < Math.min(30, rawLines.length); i++) {
      console.log(`  [${i}] ${rawLines[i].substring(0, 200)}`);
    }
    if (rawLines.length > 30) {
      console.log(`  ... (${rawLines.length - 30} more lines)`);
      console.log(`  --- Last 10 raw lines ---`);
      for (let i = Math.max(30, rawLines.length - 10); i < rawLines.length; i++) {
        console.log(`  [${i}] ${rawLines[i].substring(0, 200)}`);
      }
    }
  } catch (e) {
    console.log(`  ERROR: ${e.message}`);
  }
}

(async () => {
  console.log('=== DeepSeek Raw Stream Diagnostic ===');
  await dumpRawStream('DeepSeek-V4-Pro', 'DeepSeek V4 Pro');
  await dumpRawStream('DeepSeek-V4-Flash', 'DeepSeek V4 Flash');

  // Also test a known-working model for comparison
  await dumpRawStream('glm-5.2', 'GLM-5.2 (reference)');

  process.exit(0);
})();
