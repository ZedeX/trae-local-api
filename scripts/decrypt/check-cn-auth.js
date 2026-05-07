const fs = require('fs');
const d = JSON.parse(fs.readFileSync('c:/Users/zx/AppData/Roaming/Trae CN/User/globalStorage/storage.json', 'utf8'));
const k = 'iCubeAuthInfo://icube.cloudide';
const v = d[k];
if (v) {
  console.log('type:', typeof v);
  console.log('prefix:', v.substring(0, 80));
  if (v.startsWith('{')) {
    const auth = JSON.parse(v);
    console.log('has token:', !!auth.token);
    console.log('has refreshToken:', !!auth.refreshToken);
    console.log('userId:', auth.userId);
    console.log('expiredAt:', auth.expiredAt);
  }
} else {
  console.log('key not found');
}
