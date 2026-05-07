const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const username = os.userInfo().username;

console.log('=== Method 1: Search Trae extension host logs ===\n');

const logBase = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\logs`);
const dirs = fs.readdirSync(logBase).sort();
const latestDir = dirs[dirs.length - 2]; // skip aha_log
const latestPath = path.join(logBase, latestDir);

console.log('Latest session log dir:', latestDir);

function searchLogs(dir, depth) {
  if (depth > 4) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        searchLogs(fullPath, depth + 1);
      } else if (entry.name.endsWith('.log')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.includes('Cloud-IDE-JWT') || line.includes('cloud-ide-jwt')) {
              const tokenMatch = line.match(/(?:Cloud-IDE-JWT|cloud-ide-jwt)[^a-zA-Z]*([a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})/);
              if (tokenMatch) {
                console.log(`Found in ${path.relative(logBase, fullPath)}:`);
                console.log(`  Token length: ${tokenMatch[1].length}`);
                console.log(`  Preview: ${tokenMatch[1].substring(0, 80)}...`);
              }
            }
          }
        } catch {}
      }
    }
  } catch {}
}

searchLogs(latestPath, 0);

console.log('\n=== Method 2: Check Trae IPC pipe ===\n');

try {
  const output = execSync(
    'wmic process where "name=\'Trae CN.exe\'" get processid,commandline 2>nul | findstr /i "pipe"',
    { encoding: 'utf8', timeout: 10000 }
  );
  console.log('Pipe info:', output.substring(0, 200));
} catch {
  console.log('No pipe info found');
}

console.log('\n=== Method 3: Check chrome.debugger / CDP ===\n');

const namedPipeDir = `\\\\.\\pipe\\`;
try {
  const pipes = execSync(`powershell -Command "[System.IO.Directory]::GetFiles('\\\\.\\pipe\\') | Where-Object { $_ -match 'trae' -or $_ -match 'chrome' }"`, {
    encoding: 'utf8',
    timeout: 10000
  });
  console.log('Named pipes:', pipes.substring(0, 500));
} catch {
  console.log('No named pipes found');
}

console.log('\n=== Method 4: Read Trae workspace storage ===\n');

const wsStorageDir = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage`);
const storageJson = path.join(wsStorageDir, 'storage.json');
if (fs.existsSync(storageJson)) {
  const storage = JSON.parse(fs.readFileSync(storageJson, 'utf8'));
  const authKeys = Object.keys(storage).filter(k => k.includes('auth') || k.includes('Auth') || k.includes('token'));
  console.log('Auth-related keys in storage.json:');
  authKeys.forEach(k => {
    const v = String(storage[k]);
    console.log(`  ${k}: ${v.length > 50 ? v.substring(0, 50) + '...[' + v.length + ' chars]' : v}`);
  });
}

console.log('\n=== Method 5: Try reading from Trae LevelDB ===\n');

const leveldbDir = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage\\state.vscdb`);
if (fs.existsSync(leveldbDir)) {
  console.log('Found state.vscdb');
  const stat = fs.statSync(leveldbDir);
  console.log('Size:', stat.size);
} else {
  const leveldbAlt = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage\\leveldb`);
  if (fs.existsSync(leveldbAlt)) {
    console.log('Found leveldb directory');
    const files = fs.readdirSync(leveldbAlt);
    console.log('Files:', files.join(', '));
  } else {
    console.log('No LevelDB found');
  }
}
