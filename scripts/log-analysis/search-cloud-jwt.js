const fs = require('fs');
const path = require('path');
const os = require('os');

const username = os.userInfo().username;
const logBase = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\logs`);

const dirs = fs.readdirSync(logBase).sort();
const latestDir = dirs[dirs.length - 1];
const latestPath = path.join(logBase, latestDir);

console.log('Latest log dir:', latestDir);

function searchDir(dir, depth) {
  if (depth > 3) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        searchDir(fullPath, depth + 1);
      } else if (entry.name.endsWith('.log') && entry.name.includes('ai-agent')) {
        console.log(`\nReading: ${fullPath}`);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (line.includes('Cloud-IDE-JWT')) {
              const match = line.match(/Cloud-IDE-JWT[^"]*"([^"]+)"/);
              if (match) {
                console.log('Found Cloud-IDE-JWT, length:', match[1].length);
                console.log('Preview:', match[1].substring(0, 80) + '...');
              } else {
                const match2 = line.match(/Cloud-IDE-JWT[^\w]*([\w-]+\.[\w-]+\.[\w-]+)/);
                if (match2) {
                  console.log('Found Cloud-IDE-JWT (format2), length:', match2[1].length);
                  console.log('Preview:', match2[1].substring(0, 80) + '...');
                }
              }
            }
            if (line.includes('token') && line.includes('eyJ') && !line.includes('identity')) {
              const match3 = line.match(/(eyJ[A-Za-z0-9_-]{200,})/);
              if (match3) {
                console.log('Found long JWT token, length:', match3[1].length);
                console.log('Preview:', match3[1].substring(0, 80) + '...');
              }
            }
          }
        } catch (e) {
          console.log('Error reading:', e.message);
        }
      }
    }
  } catch {}
}

searchDir(latestPath, 0);

console.log('\n=== Also searching for token in ai-agent stdout logs ===');
const agentLogDir = path.join(latestPath, 'Modular');
if (fs.existsSync(agentLogDir)) {
  const files = fs.readdirSync(agentLogDir).filter(f => f.includes('ai-agent'));
  for (const file of files) {
    const filePath = path.join(agentLogDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').slice(-200);
    for (const line of lines) {
      if (line.includes('token') || line.includes('Token') || line.includes('JWT')) {
        const longJwt = line.match(/(eyJ[A-Za-z0-9_-]{200,})/);
        if (longJwt) {
          console.log(`Long JWT in ${file}:`);
          console.log('  Length:', longJwt[1].length);
          console.log('  Preview:', longJwt[1].substring(0, 80) + '...');
        }
      }
    }
  }
}
