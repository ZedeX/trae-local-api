const fs = require('fs');
const path = require('path');

const storagePath = path.join('C:', 'Users', 'zx', 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));

const keys = Object.keys(storage).filter(k => k.toLowerCase().includes('auth') || k.toLowerCase().includes('token'));
console.log('Auth keys:', keys);

keys.forEach(k => {
  const raw = storage[k];
  try {
    const v = JSON.parse(raw);
    console.log(`\n${k}:`);
    console.log('  token(first50):', v.token?.substring(0, 50));
    console.log('  expiredAt:', v.expiredAt);
    console.log('  host:', v.host);
    console.log('  userId:', v.userId);
    console.log('  userRegion:', JSON.stringify(v.userRegion));
    console.log('  account.scope:', v.account?.scope);
    console.log('  account.loginScope:', v.account?.loginScope);
    console.log('  account.storeRegion:', v.account?.storeRegion);
  } catch(e) {
    console.log(`\n${k}: [not JSON, first 100 chars: ${raw.substring(0, 100)}]`);
  }
});

const allKeys = Object.keys(storage);
console.log('\n\nAll keys count:', allKeys.length);
const interestingKeys = allKeys.filter(k => 
  k.includes('api') || k.includes('url') || k.includes('host') || k.includes('endpoint') || 
  k.includes('config') || k.includes('setting') || k.includes('server') || k.includes('proxy') ||
  k.includes('model') || k.includes('chat') || k.includes('ai')
);
console.log('Interesting keys:', interestingKeys);
interestingKeys.forEach(k => {
  const raw = storage[k];
  if (typeof raw === 'string' && raw.length < 500) {
    console.log(`  ${k}: ${raw}`);
  } else if (typeof raw === 'string') {
    console.log(`  ${k}: [${raw.length} chars] ${raw.substring(0, 100)}...`);
  }
});
