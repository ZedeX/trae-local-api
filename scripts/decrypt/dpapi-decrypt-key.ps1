Add-Type -AssemblyName System.Security
$encryptedKey = $args[0]
$keyBytes = [Convert]::FromBase64String($encryptedKey)
$keyBytes = $keyBytes[5..($keyBytes.Length - 1)]
$decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $keyBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
$hex = ($decryptedKey | ForEach-Object { $_.ToString("x2") }) -Join ""
Write-Host $hex
