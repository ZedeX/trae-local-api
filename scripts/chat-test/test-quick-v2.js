const { getAuthInfo, getDeviceIds, getApiHost, buildStreamHeaders, detectEdition, refreshTokenIfNeeded } = require('./src/auth');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./src/uuid');

async function test() {
  try {
    console.log('=== Trae API Quick Test ===');
    console.log('Edition:', detectEdition());

    const authInfo = await refreshTokenIfNeeded();
    console.log('Token valid, expires at:', authInfo.expiredAt);
    console.log('User:', authInfo.account?.username);
    console.log('Region:', authInfo.userRegion?.region);
    console.log('API Host:', getApiHost());

    const deviceIds = getDeviceIds();
    const requestId = uuidv4();
    const headers = buildStreamHeaders(authInfo, deviceIds, requestId);

    console.log('\n--- Testing create_agent_task ---');
    const apiHost = getApiHost();
    const sessionId = uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
    const taskId = uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);
    const messageId = uuidv4().replace(/-/g, '').substring(0, 24) + Date.now().toString(16).slice(-8);

    const body = {
      session_id: sessionId,
      task_id: taskId,
      message_id: messageId,
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Say hello in one word.' }]
        }
      ],
      model: 'claude-3.5-sonnet',
      stream: true,
      mode_type: 'Manual',
      agent_type: 'builder_v3',
      workspace_folder: '',
      workspace_id: '',
      workspace_path: '',
      extra_info: JSON.stringify({ workspace_folder: '', workspace_id: '', workspace_path: '' })
    };

    const endpoint = `${apiHost}/api/agent/v3/create_agent_task`;
    console.log('Endpoint:', endpoint);
    console.log('Headers:', JSON.stringify(Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k, typeof v === 'string' && v.length > 50 ? v.substring(0, 50) + '...' : v])
    ), null, 2));

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    console.log('\nResponse status:', resp.status);
    console.log('Response headers:', JSON.stringify(Object.fromEntries(resp.headers.entries()), null, 2));

    if (!resp.ok) {
      const errText = await resp.text();
      console.log('Error response:', errText);
      return;
    }

    console.log('\n--- Streaming response ---');
    let buffer = '';
    let chunkCount = 0;
    let fullContent = '';

    resp.body.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.substring(6).trim();
          if (data === '[DONE]') {
            console.log('\n[Stream DONE]');
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            chunkCount++;
            if (chunkCount <= 5 || chunkCount % 10 === 0) {
              console.log(`Chunk ${chunkCount}:`, JSON.stringify(parsed).substring(0, 200));
            }
          } catch (e) {
            console.log(`Raw data: ${data.substring(0, 100)}`);
          }
        }
      }
    });

    resp.body.on('end', () => {
      console.log(`\nStream ended. Total chunks: ${chunkCount}`);
    });

    resp.body.on('error', (err) => {
      console.error('Stream error:', err);
    });

  } catch (err) {
    console.error('Test failed:', err.message);
    console.error(err.stack);
  }
}

test();
