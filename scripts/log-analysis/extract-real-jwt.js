const fs = require('fs');
const path = require('path');
const os = require('os');

const username = os.userInfo().username;
const logFile = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\logs\\20260508T001850\\Modular\\ai-agent_0_1778170730838_stdout.log`);

console.log('Reading:', logFile);
const content = fs.readFileSync(logFile, 'utf8');
console.log('File size:', content.length, 'chars');

const lines = content.split('\n');
console.log('Total lines:', lines.length);

let foundTokens = new Set();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.includes('Cloud-IDE-JWT')) {
    console.log(`\nLine ${i}: Cloud-IDE-JWT found`);
    console.log('  Content:', line.substring(0, 200));
  }

  const longJwt = line.match(/(eyJ[A-Za-z0-9_-]{300,})/g);
  if (longJwt) {
    for (const jwt of longJwt) {
      if (!foundTokens.has(jwt)) {
        foundTokens.add(jwt);
        console.log(`\nLong JWT at line ${i}:`);
        console.log('  Length:', jwt.length);
        console.log('  Preview:', jwt.substring(0, 100) + '...');

        try {
          const parts = jwt.split('.');
          if (parts.length === 3) {
            const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            console.log('  Header:', JSON.stringify(header));
            console.log('  Payload keys:', Object.keys(payload));
            if (payload.exp) {
              const expDate = new Date(payload.exp * 1000);
              console.log('  Expires:', expDate.toISOString());
              console.log('  Is expired:', expDate < new Date());
            }
          }
        } catch (e) {
          console.log('  (Not a standard JWT)');
        }
      }
    }
  }
}

if (foundTokens.size === 0) {
  console.log('\nNo long JWT tokens found. Searching for any auth-related content...');
  for (let i = Math.max(0, lines.length - 50); i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('token') || line.includes('auth') || line.includes('JWT')) {
      console.log(`Line ${i}: ${line.substring(0, 150)}`);
    }
  }
}

console.log('\nTotal unique long JWTs found:', foundTokens.size);

if (foundTokens.size > 0) {
  const tokens = [...foundTokens];
  const latest = tokens[tokens.length - 1];
  const envPath = path.join(__dirname, '..', '..', '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('TRAE_MANUAL_TOKEN=')) {
    envContent = envContent.replace(/TRAE_MANUAL_TOKEN=.*/, `TRAE_MANUAL_TOKEN=${latest}`);
  } else {
    envContent += `\nTRAE_MANUAL_TOKEN=${latest}`;
  }
  fs.writeFileSync(envPath, envContent);
  console.log('\nLatest token saved to .env');
}
