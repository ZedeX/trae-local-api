const { parseToolcallContent } = require('./src/anthropic-format');

const tests = [
  // JSON format (what we asked for)
  '{"name":"Bash","params":{"command":"ls"}}',
  // XML attribute format (what model actually outputs)
  'Bash command="ls -la" description="List files"',
  // XML attribute with unclosed last quote
  'Bash command="find / -name *.srt"  description="Find SRT files',
  // XML arg_key/arg_value format
  'Bash command</arg_key><arg_value>ls -la /tmp</arg_value>description</arg_key><arg_value>List files</arg_value>',
  // JSON with spaces
  '{"name": "Read", "params": {"file_path": "/foo/bar"}}',
];

for (const t of tests) {
  try {
    const r = parseToolcallContent(t);
    console.log('OK:', JSON.stringify(r));
  } catch (e) {
    console.log('FAIL:', e.message, '| input:', t.substring(0, 80));
  }
}
