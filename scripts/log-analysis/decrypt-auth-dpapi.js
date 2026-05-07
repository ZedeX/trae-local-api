const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const username = os.userInfo().username;
const storagePath = path.join(`C:\\Users\\${username}\\AppData\\Roaming\\Trae\\User\\globalStorage\\storage.json`);

const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
const authKey = 'iCubeAuthInfo://icube.cloudide';
const authData = storage[authKey];

if (!authData) {
  console.log('No auth data found');
  process.exit(1);
}

console.log('Auth data length:', authData.length);
console.log('First 30 chars:', authData.substring(0, 30));

const buf = Buffer.from(authData, 'base64');
console.log('\nDecoded buffer length:', buf.length);
console.log('First 20 bytes (hex):', buf.slice(0, 20).toString('hex'));

const version = buf.slice(0, 3).toString('utf8');
console.log('Version prefix:', version);

if (version === 'v10' || version === 'v11') {
  console.log('\nChromium os_crypt format detected!');
  console.log('Nonce/IV length:', buf.slice(3, 15).toString('hex'));
  console.log('Ciphertext starts at byte 15');
  console.log('Ciphertext length:', buf.length - 15 - 16);
  console.log('Auth tag (last 16 bytes):', buf.slice(-16).toString('hex'));

  const psScript = `
Add-Type -AssemblyName System.Security
$encrypted = [Convert]::FromBase64String("${authData}")
$version = [System.Text.Encoding]::UTF8.GetString($encrypted, 0, 3)
Write-Host "Version: $version"

if ($version -eq "v10" -or $version -eq "v11") {
    $nonce = New-Object byte[] 12
    [Array]::Copy($encrypted, 3, $nonce, 0, 12)
    $ciphertext = New-Object byte[] ($encrypted.Length - 3 - 12 - 16)
    [Array]::Copy($encrypted, 15, $ciphertext, 0, $ciphertext.Length)
    $tag = New-Object byte[] 16
    [Array]::Copy($encrypted, $encrypted.Length - 16, $tag, 0, 16)

    $localStatePath = "$env:APPDATA\\Trae\\Local State"
    if (Test-Path $localStatePath) {
        $localState = Get-Content $localStatePath -Raw | ConvertFrom-Json
        $encryptedKey = $localState.os_crypt.encrypted_key
        Write-Host "Encrypted key found: $($encryptedKey.Substring(0, 20))..."

        $keyBytes = [Convert]::FromBase64String($encryptedKey)
        $keyBytes = $keyBytes[5..($keyBytes.Length - 1)]

        $decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
            $keyBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        Write-Host "Decrypted key length: $($decryptedKey.Length)"
        Write-Host "Key (hex): $($decryptedKey | ForEach-Object { $_.ToString("x2") })" -Join ""

        $aes = New-Object System.Security.Cryptography.AesGcm($decryptedKey)
        $plaintext = New-Object byte[] $ciphertext.Length
        $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext, $null)
        $result = [System.Text.Encoding]::UTF8.GetString($plaintext)
        Write-Host "DECRYPTED AUTH DATA:"
        Write-Host $result
    } else {
        Write-Host "Local State file not found at: $localStatePath"
    }
}
`;

  const psPath = path.join(os.tmpdir(), 'decrypt-trae-auth.ps1');
  fs.writeFileSync(psPath, psScript);
  console.log('\nRunning PowerShell decryption script...');

  try {
    const result = execSync(`powershell -ExecutionPolicy Bypass -File "${psPath}"`, {
      encoding: 'utf8',
      timeout: 30000
    });
    console.log(result);

    const tokenMatch = result.match(/"token"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      console.log('\n=== TOKEN EXTRACTED ===');
      console.log('Token length:', tokenMatch[1].length);
      console.log('Token preview:', tokenMatch[1].substring(0, 80) + '...');

      const envPath = path.join(__dirname, '..', '..', '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('TRAE_MANUAL_TOKEN=')) {
        envContent = envContent.replace(/TRAE_MANUAL_TOKEN=.*/, `TRAE_MANUAL_TOKEN=${tokenMatch[1]}`);
      } else {
        envContent += `\nTRAE_MANUAL_TOKEN=${tokenMatch[1]}`;
      }
      fs.writeFileSync(envPath, envContent);
      console.log('Token saved to .env');
    }
  } catch (e) {
    console.log('PowerShell error:', e.message);
    if (e.stdout) console.log('stdout:', e.stdout);
    if (e.stderr) console.log('stderr:', e.stderr);
  }

  try { fs.unlinkSync(psPath); } catch {}
} else {
  console.log('Unknown encryption format');
}
