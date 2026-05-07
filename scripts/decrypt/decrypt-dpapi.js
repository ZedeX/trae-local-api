const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const cnStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(cnStoragePath, 'utf-8'));
const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

if (!encryptedAuth) {
  console.error('No encrypted auth data found');
  process.exit(1);
}

console.log('Encrypted auth starts with:', encryptedAuth.substring(0, 30));
console.log('Length:', encryptedAuth.length);

const buffer = Buffer.from(encryptedAuth, 'base64');
console.log('Buffer length:', buffer.length);
console.log('First 20 bytes hex:', buffer.slice(0, 20).toString('hex'));

const prefix = buffer.slice(0, 4).toString('ascii');
console.log('Prefix:', prefix);

const version = buffer.readUInt8(4);
console.log('Version byte:', version);

const psScript = `
Add-Type -AssemblyName System.Security
$encryptedBase64 = "${encryptedAuth}"
$encryptedBytes = [System.Convert]::FromBase64String($encryptedBase64)

try {
    $decryptedBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $encryptedBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $decryptedText = [System.Text.Encoding]::UTF8.GetString($decryptedBytes)
    Write-Output $decryptedText
} catch {
    Write-Error "DPAPI decrypt failed: $_"
    
    try {
        $decryptedBytes2 = [System.Security.Cryptography.ProtectedData]::Unprotect(
            $encryptedBytes,
            $null,
            [System.Security.Cryptography.DataProtectionScope]::LocalMachine
        )
        $decryptedText2 = [System.Text.Encoding]::UTF8.GetString($decryptedBytes2)
        Write-Output $decryptedText2
    } catch {
        Write-Error "LocalMachine DPAPI also failed: $_"
    }
}
`;

try {
  const result = execSync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000
  });
  console.log('\nDecrypted result:', result.substring(0, 500));
  
  const outputPath = path.join('d:', '_program', 'Trae', 'zx-test', 'cn-auth-decrypted.json');
  fs.writeFileSync(outputPath, result, 'utf-8');
  console.log('Saved to:', outputPath);
} catch (err) {
  console.error('PowerShell execution failed:', err.message);
  console.error('stderr:', err.stderr?.substring(0, 500));
}
