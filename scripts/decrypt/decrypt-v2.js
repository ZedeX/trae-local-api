const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const cnStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
const storage = JSON.parse(fs.readFileSync(cnStoragePath, 'utf-8'));
const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

const buffer = Buffer.from(encryptedAuth, 'base64');

console.log('Prefix:', buffer.slice(0, 2).toString('ascii'));
console.log('Version:', buffer.readUInt16LE(2));
console.log('Total length:', buffer.length);

const psScript = `
Add-Type -AssemblyName System.Security

$encryptedBase64 = "${encryptedAuth}"
$allBytes = [System.Convert]::FromBase64String($encryptedBase64)

$prefix = [System.Text.Encoding]::ASCII.GetString($allBytes[0..1])
Write-Host "Prefix: $prefix"

$version = [System.BitConverter]::ToUInt16($allBytes, 2)
Write-Host "Version: $version"

$encryptedData = $allBytes[8..($allBytes.Length - 1)]
Write-Host "Encrypted data length: $($encryptedData.Length)"

try {
    $decryptedBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $encryptedData,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $decryptedText = [System.Text.Encoding]::UTF8.GetString($decryptedBytes)
    Write-Host "DECRYPTED:"
    Write-Host $decryptedText
    
    $outputPath = "d:\\_program\\Trae\\zx-test\\cn-auth-decrypted.json"
    [System.IO.File]::WriteAllText($outputPath, $decryptedText, [System.Text.Encoding]::UTF8)
    Write-Host "Saved to: $outputPath"
} catch {
    Write-Error "DPAPI decrypt failed (offset 8): $_"
    
    try {
        $encryptedData2 = $allBytes[12..($allBytes.Length - 1)]
        $decryptedBytes2 = [System.Security.Cryptography.ProtectedData]::Unprotect(
            $encryptedData2,
            $null,
            [System.Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $decryptedText2 = [System.Text.Encoding]::UTF8.GetString($decryptedBytes2)
        Write-Host "DECRYPTED (offset 12):"
        Write-Host $decryptedText2
    } catch {
        Write-Error "DPAPI decrypt also failed (offset 12): $_"
    }
}
`;

const psPath = path.join('d:', '_program', 'Trae', 'zx-test', 'decrypt-v2.ps1');
fs.writeFileSync(psPath, psScript, 'utf-8');

try {
  const result = execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000
  });
  console.log('\nResult:', result.substring(0, 2000));
} catch (err) {
  console.error('Failed:', err.message.substring(0, 500));
  console.error('stdout:', err.stdout?.substring(0, 500));
  console.error('stderr:', err.stderr?.substring(0, 500));
}
