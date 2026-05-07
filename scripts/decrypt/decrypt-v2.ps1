
Add-Type -AssemblyName System.Security

$encryptedBase64 = "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"
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
    
    $outputPath = "d:\_program\Trae\zx-test\cn-auth-decrypted.json"
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
