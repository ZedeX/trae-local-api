const fs = require('fs');
const path = require('path');
const os = require('os');

const username = os.userInfo().username;
const storagePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage\\storage.json`);
const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
const authKey = 'iCubeAuthInfo://icube.cloudide';
const authData = storage[authKey];

const buf = Buffer.from(authData, 'base64');

console.log('=== Trae Custom Encryption Format Analysis ===\n');
console.log('Total length:', buf.length);
console.log('First 50 bytes (hex):');
for (let i = 0; i < Math.min(50, buf.length); i++) {
  process.stdout.write(buf[i].toString(16).padStart(2, '0') + ' ');
  if ((i + 1) % 16 === 0) process.stdout.write('\n');
}
console.log('\n');

const prefix = buf.slice(0, 2).toString('utf8');
console.log('Prefix:', prefix, '(0x' + buf.slice(0, 2).toString('hex') + ')');
console.log('Byte 2:', buf[2], '(0x' + buf[2].toString(16) + ')');
console.log('Byte 3:', buf[3], '(0x' + buf[3].toString(16) + ')');

const version = buf.readUInt32LE(2);
console.log('Version (uint32 LE at offset 2):', version);

const localStatePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\Local State`);
if (fs.existsSync(localStatePath)) {
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
  console.log('\n=== Local State ===');
  if (localState.os_crypt) {
    console.log('os_crypt.encrypted_key:', localState.os_crypt.encrypted_key?.substring(0, 30) + '...');
  }
  console.log('Top-level keys:', Object.keys(localState));
} else {
  console.log('\nNo Local State file found');
}

const otherStorageKeys = Object.keys(storage).filter(k => {
  const v = String(storage[k]);
  return v.length > 50 && (v.startsWith('dGM') || v.startsWith('v10') || v.startsWith('v11'));
});
console.log('\nOther encrypted storage entries:');
otherStorageKeys.forEach(k => {
  const v = String(storage[k]);
  const buf2 = Buffer.from(v, 'base64');
  console.log(`  ${k}: prefix=${buf2.slice(0, 2).toString('utf8')}, length=${buf2.length}`);
});
