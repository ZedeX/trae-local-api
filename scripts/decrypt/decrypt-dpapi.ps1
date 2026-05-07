Add-Type -AssemblyName System.Security

$cnStoragePath = "$env:APPDATA\Trae CN\User\globalStorage\storage.json"
$storage = Get-Content $cnStoragePath -Raw | ConvertFrom-Json
$encryptedAuth = $storage.'iCubeAuthInfo://icube.cloudide'

if (-not $encryptedAuth) {
    Write-Error "No encrypted auth data found"
    exit 1
}

Write-Host "Encrypted auth starts with: $($encryptedAuth.Substring(0, 20))"

$encryptedBytes = [System.Convert]::FromBase64String($encryptedAuth)
Write-Host "Buffer length: $($encryptedBytes.Length)"

try {
    $decryptedBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
        $encryptedBytes,
        $null,
        [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
    $decryptedText = [System.Text.Encoding]::UTF8.GetString($decryptedBytes)
    Write-Host "Decrypted auth:"
    Write-Host $decryptedText
    
    $outputPath = "d:\_program\Trae\zx-test\cn-auth-decrypted.json"
    $decryptedText | Out-File -FilePath $outputPath -Encoding utf8
    Write-Host "Saved to: $outputPath"
} catch {
    Write-Error "CurrentUser DPAPI decrypt failed: $_"
    
    try {
        $decryptedBytes2 = [System.Security.Cryptography.ProtectedData]::Unprotect(
            $encryptedBytes,
            $null,
            [System.Security.Cryptography.DataProtectionScope]::LocalMachine
        )
        $decryptedText2 = [System.Text.Encoding]::UTF8.GetString($decryptedBytes2)
        Write-Host "Decrypted auth (LocalMachine):"
        Write-Host $decryptedText2
        
        $outputPath = "d:\_program\Trae\zx-test\cn-auth-decrypted.json"
        $decryptedText2 | Out-File -FilePath $outputPath -Encoding utf8
        Write-Host "Saved to: $outputPath"
    } catch {
        Write-Error "LocalMachine DPAPI also failed: $_"
    }
}
