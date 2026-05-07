const { getAuthInfo, getDeviceIds, getApiHost, refreshTokenIfNeeded } = require('./src/auth');
const { llmUtilsChat } = require('./src/trae-client');
const { parseLlmUtilsChatStream, normalizeLlmUtilsChunk } = require('./src/openai-format');

async function main() {
  const messages = [{ role: 'user', content: 'Say "OK" and nothing else.' }];
  const result = await llmUtilsChat(messages, 'auto', true);

  let buffer = '';
  let currentEventName = '';

  result.body.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = parseLlmUtilsChatStream(trimmed, currentEventName);
      if (!parsed) continue;

      if (parsed._type === 'event_name') {
        currentEventName = parsed.value;
        console.log(`[EVENT] ${currentEventName}`);
        continue;
      }

      console.log(`[CHUNK] type=${parsed.type}, content="${(parsed.content || '').substring(0, 50)}", data="${JSON.stringify(parsed.data || '').substring(0, 50)}"`);
    }
  });

  result.body.on('end', () => {
    console.log('\n[END]');
    process.exit(0);
  });
}

main().catch(console.error);
