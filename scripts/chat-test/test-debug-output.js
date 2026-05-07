const http = require('http');

const body = JSON.stringify({
  model: 'auto',
  messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
  stream: true,
});

const req = http.request({
  hostname: 'localhost',
  port: 9900,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer trae-local-api-key',
    'Content-Type': 'application/json',
  }
}, (res) => {
  res.on('data', (chunk) => {
    const str = chunk.toString();
    const lines = str.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.choices && data.choices[0] && data.choices[0].delta) {
            const delta = data.choices[0].delta;
            if (delta.content) {
              console.log(`CONTENT: "${delta.content}"`);
            }
          }
        } catch (e) {}
      }
    }
  });
});

req.write(body);
req.end();
