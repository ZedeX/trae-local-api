const koffi = require('koffi');
const path = require('path');

const dllPath = path.resolve('D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll');
console.log('Loading DLL:', dllPath);

try {
  const lib = koffi.load(dllPath);
  console.log('DLL loaded successfully');

  const BP_Initialize = lib.func('BP_Initialize', 'int', ['str', 'str', 'str']);
  console.log('BP_Initialize signature: int BP_Initialize(str, str, str)');

  const BP_GetInterface = lib.func('BP_GetInterface', 'void*', []);
  console.log('BP_GetInterface signature: void* BP_GetInterface()');

  const BP_Shutdown = lib.func('BP_Shutdown', 'void', []);
  console.log('BP_Shutdown signature: void BP_Shutdown()');

  const ai_agent_ipc_init = lib.func('ai_agent_ipc_init', 'int', ['str']);
  console.log('ai_agent_ipc_init signature: int ai_agent_ipc_init(str)');

  const ai_agent_ipc_connect = lib.func('ai_agent_ipc_connect', 'int', ['str', 'str']);
  console.log('ai_agent_ipc_connect signature: int ai_agent_ipc_connect(str, str)');

  const ai_agent_ipc_disconnect = lib.func('ai_agent_ipc_disconnect', 'int', ['int']);
  console.log('ai_agent_ipc_disconnect signature: int ai_agent_ipc_disconnect(int)');

  const ai_agent_ipc_recv = lib.func('ai_agent_ipc_recv', 'int', ['int', 'void**', 'int*']);
  console.log('ai_agent_ipc_recv signature: int ai_agent_ipc_recv(int, void**, int*)');

  console.log('\nTrying BP_Initialize...');
  const configDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN';
  const logDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs';
  const result = BP_Initialize(configDir, logDir, '');
  console.log('BP_Initialize result:', result);

  if (result === 0) {
    console.log('\nTrying BP_GetInterface...');
    const iface = BP_GetInterface();
    console.log('BP_GetInterface returned:', iface);

    console.log('\nTrying ai_agent_ipc_init...');
    const ipcResult = ai_agent_ipc_init('test_channel');
    console.log('ai_agent_ipc_init result:', ipcResult);

    if (ipcResult === 0) {
      console.log('\nTrying ai_agent_ipc_connect...');
      const connectResult = ai_agent_ipc_connect('test_channel', '');
      console.log('ai_agent_ipc_connect result:', connectResult);
    }

    console.log('\nShutting down...');
    BP_Shutdown();
  }

  lib.unload();
} catch (err) {
  console.error('Error:', err.message);
  console.error(err.stack);
}
