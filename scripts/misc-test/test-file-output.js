const fetch = require('node-fetch');

async function test() {
  const API_BASE = 'http://localhost:9900';
  const API_KEY = 'trae-local-api-key';

  console.log('=== Test 1: /v1/chat/file endpoint ===');
  const res1 = await fetch(`${API_BASE}/v1/chat/file`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
      filename: 'test-output.txt',
      overwrite: true
    })
  });
  const data1 = await res1.json();
  console.log('Status:', res1.status);
  console.log('Response:', JSON.stringify(data1, null, 2));

  console.log('\n=== Test 2: /v1/chat/completions with save_to ===');
  const res2 = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'auto',
      messages: [{ role: 'user', content: 'Say "OK" and nothing else.' }],
      stream: false,
      save_to: 'test-save-to.txt'
    })
  });
  const data2 = await res2.json();
  console.log('Status:', res2.status);
  console.log('saved_to:', data2.saved_to);
  console.log('Content preview:', data2.choices?.[0]?.message?.content?.substring(0, 50));

  console.log('\n=== Test 3: /v1/files endpoint ===');
  const res3 = await fetch(`${API_BASE}/v1/files`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  const data3 = await res3.json();
  console.log('Workspace:', data3.workspace);
  console.log('File count:', data3.files?.length);
  const testFiles = data3.files?.filter(f => f.name.includes('test-output') || f.name.includes('test-save'));
  console.log('Test files:', testFiles?.map(f => `${f.path} (${f.size} bytes)`));

  console.log('\n=== Test 4: /v1/files/read endpoint ===');
  const res4 = await fetch(`${API_BASE}/v1/files/read?path=test-output.txt`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` }
  });
  const data4 = await res4.json();
  console.log('File path:', data4.path);
  console.log('File size:', data4.size);
  console.log('Content:', data4.content?.substring(0, 100));

  console.log('\n=== All file tests completed ===');
}

test().catch(console.error);
