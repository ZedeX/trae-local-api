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
  let data = '';
  res.on('data', (chunk) => {
    data += chunk.toString();
  });
  res.on('end', () => {
    console.log('=== Raw SSE Output ===');
    console.log(data);
  });
});

req.write(body);
req.end();
