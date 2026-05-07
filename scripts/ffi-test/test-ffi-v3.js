const koffi = require('koffi');
const path = require('path');

const dllPath = path.resolve('D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll');
console.log('Loading DLL:', dllPath);

try {
  const lib = koffi.load(dllPath);
  console.log('DLL loaded successfully');

  const BP_Initialize = lib.func('int BP_Initialize(const char*, const char*, const char*)');
  const BP_GetInterface = lib.func('void* BP_GetInterface(const char*)');
  const BP_Shutdown = lib.func('void BP_Shutdown()');

  console.log('Trying BP_Initialize with different parameter combinations...');

  const tests = [
    ['', '', ''],
    [null, null, null],
  ];

  for (const [p1, p2, p3] of tests) {
    try {
      console.log(`  Testing: (${JSON.stringify(p1)}, ${JSON.stringify(p2)}, ${JSON.stringify(p3)})`);
      const result = BP_Initialize(p1, p2, p3);
      console.log(`  Result: ${result}`);
      break;
    } catch (e) {
      console.log(`  Error: ${e.message}`);
    }
  }

  lib.unload();
} catch (err) {
  console.error('Error:', err.message);
}
