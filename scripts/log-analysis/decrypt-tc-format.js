const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const username = os.userInfo().username;
const storagePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage\\storage.json`);
const localStatePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\Local State`);

const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
const authKey = 'iCubeAuthInfo://icube.cloudide';
const authData = storage[authKey];
const encryptedKey = localState.os_crypt.encrypted_key;

const psScript = `
Add-Type -AssemblyName System.Security

$encryptedKey = "${encryptedKey}"
$keyBytes = [Convert]::FromBase64String($encryptedKey)
Write-Host "Key bytes length: $($keyBytes.Length)"
Write-Host "Key prefix: $([System.Text.Encoding]::UTF8.GetString($keyBytes, 0, 5))"

$keyBytes = $keyBytes[5..($keyBytes.Length - 1)]
$decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $keyBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
Write-Host "Decrypted key length: $($decryptedKey.Length)"
$keyHex = ($decryptedKey | ForEach-Object { $_.ToString("x2") }) -Join ""
Write-Host "Key hex: $keyHex"

$authBase64 = "${authData}"
$authBytes = [Convert]::FromBase64String($authBase64)
Write-Host "Auth bytes length: $($authBytes.Length)"

$prefix = [System.Text.Encoding]::UTF8.GetString($authBytes, 0, 2)
Write-Host "Prefix: $prefix"

$version = [BitConverter]::ToUInt32($authBytes, 2)
Write-Host "Version: $version"

$nonceOffset = 6
$nonceLength = 12
$nonce = New-Object byte[] $nonceLength
[Array]::Copy($authBytes, $nonceOffset, $nonce, 0, $nonceLength)
Write-Host "Nonce: $(($nonce | ForEach-Object { $_.ToString("x2") }) -Join "")"

$tagOffset = $authBytes.Length - 16
$tag = New-Object byte[] 16
[Array]::Copy($authBytes, $tagOffset, $tag, 0, 16)
Write-Host "Tag: $(($tag | ForEach-Object { $_.ToString("x2") }) -Join "")"

$ciphertextLength = $tagOffset - $nonceOffset - $nonceLength
Write-Host "Ciphertext length: $ciphertextLength"

$ciphertext = New-Object byte[] $ciphertextLength
[Array]::Copy($authBytes, $nonceOffset + $nonceLength, $ciphertext, 0, $ciphertextLength)

try {
    $aes = New-Object System.Security.Cryptography.AesGcm($decryptedKey)
    $plaintext = New-Object byte[] $ciphertextLength
    $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext, $null)
    $result = [System.Text.Encoding]::UTF8.GetString($plaintext)
    Write-Host "DECRYPTED_RESULT:$result"
} catch {
    Write-Host "AES-GCM decrypt failed: $_"

    Write-Host "Trying with offset 8 for nonce..."
    $nonce2 = New-Object byte[] 12
    [Array]::Copy($authBytes, 8, $nonce2, 0, 12)
    $tag2Offset = $authBytes.Length - 16
    $tag2 = New-Object byte[] 16
    [Array]::Copy($authBytes, $tag2Offset, $tag2, 0, 16)
    $ct2Len = $tag2Offset - 8 - 12
    $ct2 = New-Object byte[] $ct2Len
    [Array]::Copy($authBytes, 20, $ct2, 0, $ct2Len)

    try {
        $aes2 = New-Object System.Security.Cryptography.AesGcm($decryptedKey)
        $pt2 = New-Object byte[] $ct2Len
        $aes2.Decrypt($nonce2, $ct2, $tag2, $pt2, $null)
        $result2 = [System.Text.Encoding]::UTF8.GetString($pt2)
        Write-Host "DECRYPTED_RESULT_V2:$result2"
    } catch {
        Write-Host "AES-GCM v2 also failed: $_"
    }
}
`;

const psPath = path.join(os.tmpdir(), 'decrypt-trae-tc.ps1');
fs.writeFileSync(psPath, psScript);

try {
  const result = execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, {
    encoding: 'utf8',
    timeout: 30000
  });
  console.log(result);

  const match = result.match(/DECRYPTED_RESULT_V?2?:(.+)/s);
  if (match) {
    const decrypted = match[1].trim();
    console.log('\n=== DECRYPTED AUTH DATA ===');
    try {
      const authObj = JSON.parse(decrypted);
      console.log('Token length:', authObj.token?.length);
      console.log('Token preview:', authObj.token?.substring(0, 80) + '...');
      console.log('Has refreshToken:', !!authObj.refreshToken);
      console.log('UserId:', authObj.userId);

      if (authObj.token) {
        const envPath = path.join(__dirname, '..', '..', '.env');
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('TRAE_MANUAL_TOKEN=')) {
          envContent = envContent.replace(/TRAE_MANUAL_TOKEN=.*/, `TRAE_MANUAL_TOKEN=${authObj.token}`);
        } else {
          envContent += `\nTRAE_MANUAL_TOKEN=${authObj.token}`;
        }
        fs.writeFileSync(envPath, envContent);
        console.log('\nToken saved to .env!');
      }
    } catch (e) {
      console.log('Decrypted content (raw):', decrypted.substring(0, 200));
    }
  }
} catch (e) {
  console.log('Error:', e.message);
  if (e.stdout) console.log('stdout:', e.stdout.substring(0, 500));
  if (e.stderr) console.log('stderr:', e.stderr.substring(0, 500));
}

try { fs.unlinkSync(psPath); } catch {}
