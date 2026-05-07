const { execSync } = require('child_process');

console.log('=== Checking if ai-agent process is running ===');
try {
  const result = execSync('tasklist /FI "IMAGENAME eq ai_agent.exe"', { encoding: 'utf8' });
  console.log(result);
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Checking for Trae processes ===');
try {
  const result = execSync('tasklist /FI "IMAGENAME eq Trae*" /FI "IMAGENAME eq trae*" /FI "IMAGENAME eq ai_agent*"', { encoding: 'utf8' });
  console.log(result);
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Checking for named pipes ===');
try {
  const result = execSync('powershell -Command "[System.IO.Directory]::GetFiles(\'\\\\.\\\\pipe\\\\\') | Where-Object { $_ -match \'ai_agent|trae|aha\' } | Select-Object -First 20"', { encoding: 'utf8' });
  console.log(result);
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Checking for Trae-related TCP connections ===');
try {
  const result = execSync('netstat -ano | findstr "443" | findstr "ESTABLISHED"', { encoding: 'utf8' });
  const lines = result.split('\n').filter(l => l.trim());
  console.log(`Found ${lines.length} established connections on port 443`);
  for (const l of lines.slice(0, 10)) {
    console.log(l.trim());
  }
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Checking ai-agent log for IPC mechanism ===');
const fs = require('fs');
const path = require('path');

const logsDir = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\logs';
const logDirs = fs.readdirSync(logsDir).sort().reverse();
if (logDirs.length > 0) {
  const latestDir = path.join(logsDir, logDirs[0], 'Modular');
  if (fs.existsSync(latestDir)) {
    const logFiles = fs.readdirSync(latestDir).filter(f => f.includes('ai-agent') && f.includes('stdout'));
    if (logFiles.length > 0) {
      const logFile = path.join(latestDir, logFiles[0]);
      const stat = fs.statSync(logFile);
      const readSize = Math.min(stat.size, 5 * 1024 * 1024);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(logFile, 'r');
      fs.readSync(fd, buffer, 0, readSize, 0);
      fs.closeSync(fd);
      const text = buffer.toString('utf8');
      const lines = text.split('\n');

      console.log('\nSearching for IPC-related log entries...');
      const ipcLines = lines.filter(l => 
        (l.includes('ipc_init') || l.includes('ipc_connect') || l.includes('named_pipe') || 
         l.includes('socket_path') || l.includes('listen') || l.includes('bind') ||
         l.includes('transport') || l.includes('channel') || l.includes('server started')) &&
        !l.includes('History')
      );
      console.log(`Found ${ipcLines.length} IPC-related lines`);
      for (const l of ipcLines.slice(0, 10)) {
        console.log(l.substring(0, Math.min(l.length, 500)));
        console.log('---');
      }

      console.log('\nSearching for startup/init log entries...');
      const startupLines = lines.filter(l => 
        (l.includes('started') || l.includes('init') || l.includes('ready') || l.includes('listening')) &&
        !l.includes('History') && !l.includes('run_command') &&
        l.length < 500
      );
      console.log(`Found ${startupLines.length} startup lines`);
      for (const l of startupLines.slice(0, 10)) {
        console.log(l.substring(0, Math.min(l.length, 500)));
        console.log('---');
      }
    }
  }
}
