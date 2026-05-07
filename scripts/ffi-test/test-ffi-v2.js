const koffi = require('koffi');
const path = require('path');

const dllPath = path.resolve('D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll');
console.log('Loading DLL:', dllPath);

try {
  const lib = koffi.load(dllPath);
  console.log('DLL loaded successfully');

  const BP_Initialize = lib.func('int __cdecl BP_Initialize(const char*, const char*, const char*)');
  const BP_GetInterface = lib.func('void* __cdecl BP_GetInterface(const char*)');
  const BP_Shutdown = lib.func('void __cdecl BP_Shutdown()');

  const ai_agent_ipc_init = lib.func('int __cdecl ai_agent_ipc_init(const char*)');
  const ai_agent_ipc_connect = lib.func('int __cdecl ai_agent_ipc_connect(const char*, const char*)');
  const ai_agent_ipc_disconnect = lib.func('int __cdecl ai_agent_ipc_disconnect(int)');
  const ai_agent_ipc_recv = lib.func('int __cdecl ai_agent_ipc_recv(int, _Out_ void**, _Out_ int*)');

  console.log('All function signatures loaded');

  const configDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN';
  const logDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs';

  console.log('\nTrying BP_Initialize...');
  let result;
  try {
    result = BP_Initialize(configDir, logDir, '');
    console.log('BP_Initialize result:', result);
  } catch (e) {
    console.log('BP_Initialize error:', e.message);
    console.log('Trying with different params...');

    try {
      result = BP_Initialize('', '', '');
      console.log('BP_Initialize(empty) result:', result);
    } catch (e2) {
      console.log('BP_Initialize(empty) error:', e2.message);
    }
  }

  if (result === 0) {
    console.log('\nTrying BP_GetInterface with different interface names...');
    const interfaces = [
      'BP_IPC_SERVER;1.0',
      'BP_IPC_SERVER_INTERFACE;1.0',
      'BP_IPC_SERVER_INTERFACE_1_0',
      'BP_IPC_CLIENT;1.0',
      'BP_IPC_CLIENT_INTERFACE;1.0',
      'BP_IPC_CLIENT_INTERFACE_1_0',
      'BP_AHANET_CLIENT;1.0',
    ];

    for (const iface of interfaces) {
      try {
        const ptr = BP_GetInterface(iface);
        console.log(`  ${iface}: ptr=${ptr}`);
      } catch (e) {
        console.log(`  ${iface}: error=${e.message}`);
      }
    }

    console.log('\nShutting down...');
    BP_Shutdown();
  }

  lib.unload();
} catch (err) {
  console.error('Error:', err.message);
  console.error(err.stack);
}
