const fs = require('fs');
const path = require('path');
const os = require('os');

const tmp = os.tmpdir();
const dirs = fs.readdirSync(tmp).filter(d => d.startsWith('trae-ai-agent') || d.startsWith('Trae'));

let latest = '';
let latestTime = 0;
for (const d of dirs) {
  const full = path.join(tmp, d);
  try {
    const st = fs.statSync(full);
    if (st.mtimeMs > latestTime) {
      latestTime = st.mtimeMs;
      latest = full;
    }
  } catch (e) {}
}

if (!latest) {
  console.log('No ai-agent dir found');
  process.exit(1);
}

console.log('Dir:', latest);
const files = fs.readdirSync(latest).filter(f => f.endsWith('.log')).sort();
if (files.length === 0) {
  console.log('No log files found');
  process.exit(1);
}

const logFile = path.join(latest, files[files.length - 1]);
console.log('Log:', logFile);

const content = fs.readFileSync(logFile, 'utf8');
const lines = content.split('\n');

let found = false;
for (const line of lines) {
  if (line.includes('Cloud-IDE-JWT') && !line.includes('cloud-ide-jwt')) {
    const m = line.match(/Cloud-IDE-JWT[^"]*"([^"]{20,})/);
    if (m) {
      console.log('JWT found, length:', m[1].length);
      console.log('Preview:', m[1].substring(0, 80) + '...');

      const tokenMatch = m[1].match(/^eyJ/);
      if (tokenMatch) {
        console.log('Token starts with eyJ (valid JWT format)');
      }

      const envPath = path.join(__dirname, '..', '..', '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      envContent = envContent.replace(/TRAE_MANUAL_TOKEN=.*/, `TRAE_MANUAL_TOKEN=${m[1]}`);
      if (!envContent.includes('TRAE_MANUAL_TOKEN')) {
        envContent += `\nTRAE_MANUAL_TOKEN=${m[1]}`;
      }
      fs.writeFileSync(envPath, envContent);
      console.log('Token saved to .env');
      found = true;
      break;
    }
  }
}

if (!found) {
  console.log('No JWT token found in logs');
  console.log('Searching for any token-like strings...');
  for (const line of lines.slice(-100)) {
    if (line.includes('eyJ') && line.length > 200) {
      const m = line.match(/(eyJ[A-Za-z0-9_-]{50,})/);
      if (m) {
        console.log('Found token-like string, length:', m[1].length);
        console.log('Preview:', m[1].substring(0, 80) + '...');
        break;
      }
    }
  }
}
