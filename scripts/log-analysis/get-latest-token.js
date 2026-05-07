const fs = require('fs');
const path = require('path');

const storagePath = 'C:\\Users\\zx\\AppData\\Roaming\\Trae CN\\User\\globalStorage\\storage.json';

try {
  const data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  
  const tokenKeys = Object.keys(data).filter(k => 
    k.toLowerCase().includes('token') || 
    k.toLowerCase().includes('auth') ||
    k.toLowerCase().includes('jwt') ||
    k.toLowerCase().includes('credential') ||
    k.toLowerCase().includes('session')
  );
  
  console.log('Token-related keys:', tokenKeys);
  
  for (const key of tokenKeys) {
    const val = data[key];
    if (typeof val === 'string' && val.length > 20) {
      console.log(`\n${key}: ${val.substring(0, 100)}...`);
    } else if (typeof val === 'object') {
      console.log(`\n${key}: ${JSON.stringify(val).substring(0, 200)}`);
    } else {
      console.log(`\n${key}: ${val}`);
    }
  }

  const authKeys = Object.keys(data).filter(k => 
    k.includes('cloudide') || k.includes('CloudIDE') || k.includes('cloud_ide')
  );
  console.log('\nCloudIDE-related keys:', authKeys);
  for (const key of authKeys) {
    const val = data[key];
    if (typeof val === 'string' && val.length > 20) {
      console.log(`  ${key}: ${val.substring(0, 100)}...`);
    } else {
      console.log(`  ${key}: ${JSON.stringify(val).substring(0, 200)}`);
    }
  }

  const allKeys = Object.keys(data);
  console.log('\nAll keys count:', allKeys.length);
  console.log('All keys:', allKeys.join(', '));
} catch (e) {
  console.error('Error:', e.message);
}
