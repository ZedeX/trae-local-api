const fs = require('fs');
const path = require('path');
const os = require('os');

const cnStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(cnStoragePath, 'utf-8'));
const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

const buffer = Buffer.from(encryptedAuth, 'base64');

console.log('Total length:', buffer.length);
console.log('First 50 bytes hex:', buffer.slice(0, 50).toString('hex'));

const prefix = buffer.slice(0, 4).toString('ascii');
console.log('Prefix (ascii):', prefix);

const version = buffer.readUInt32LE(4);
console.log('Version (LE):', version);

const versionBE = buffer.readUInt32BE(4);
console.log('Version (BE):', versionBE);

const byte4 = buffer.readUInt8(4);
const byte5 = buffer.readUInt8(5);
console.log('Byte 4:', byte4, 'Byte 5:', byte5);

console.log('\nHex dump of first 100 bytes:');
for (let i = 0; i < Math.min(100, buffer.length); i += 16) {
  const hex = buffer.slice(i, i + 16).toString('hex').match(/.{1,2}/g).join(' ');
  const ascii = buffer.slice(i, i + 16).toString('ascii').replace(/[^\x20-\x7e]/g, '.');
  console.log(`${i.toString(16).padStart(4, '0')}: ${hex.padEnd(47)} ${ascii}`);
}
