// tests/test-toolcall-parser.js
// Unit test for parseToolcallContent - verifies 6 toolcall parsing formats
const { parseToolcallContent } = require('../src/anthropic-format');

const testCases = [
  // Format 1: Direct JSON
  {
    name: 'F1-direct-json',
    input: '{"name":"Read","params":{"path":"a.txt"}}',
    expect: { name: 'Read', params: { path: 'a.txt' } }
  },
  // Format 2: XML named
  {
    name: 'F2-xml-named',
    input: '<toolcall name="Read"><param name="path">a.txt</param></toolcall>',
    expect: { name: 'Read', params: { path: 'a.txt' } }
  },
  // Format 3: XML arg_key/arg_value
  {
    name: 'F3-xml-argkey',
    input: 'Read <arg_key>path</arg_key><arg_value>a.txt</arg_value>',
    expect: { name: 'Read', params: { path: 'a.txt' } }
  },
  // Format 4: XML attribute
  {
    name: 'F4-xml-attr',
    input: 'Read path="a.txt"',
    expect: { name: 'Read', params: { path: 'a.txt' } }
  },
  // Format 5: JSON fixup (single quotes, trailing comma)
  {
    name: 'F5-json-fixup',
    input: "{'name':'Read','params':{'path':'a.txt',}}",
    expect: { name: 'Read', params: { path: 'a.txt' } }
  },
  // Format 6: JSON extract from mixed content
  {
    name: 'F6-json-extract',
    input: 'Let me read that {"name":"Read","params":{"path":"a.txt"}} for you',
    expect: { name: 'Read', params: { path: 'a.txt' } }
  },
];

console.log('=== Toolcall Parser Unit Test ===\n');
let pass = 0, fail = 0;
for (const tc of testCases) {
  try {
    const result = parseToolcallContent(tc.input);
    const ok = result &&
      result.name === tc.expect.name &&
      JSON.stringify(result.params) === JSON.stringify(tc.expect.params);
    if (ok) {
      console.log(`  PASS: ${tc.name}`);
      pass++;
    } else {
      console.log(`  FAIL: ${tc.name}`);
      console.log(`    expected: ${JSON.stringify(tc.expect)}`);
      console.log(`    got:      ${JSON.stringify(result)}`);
      fail++;
    }
  } catch(e) {
    console.log(`  FAIL: ${tc.name} - ${e.message}`);
    fail++;
  }
}
console.log(`\n${pass}/${testCases.length} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
