Add-Type -AssemblyName System.Security

$storagePath = "$env:APPDATA\Trae\User\globalStorage\storage.json"
$localStatePath = "$env:APPDATA\Trae\Local State"

$storage = Get-Content $storagePath -Raw | ConvertFrom-Json
$localState = Get-Content $localStatePath -Raw | ConvertFrom-Json

$authData = $storage.'iCubeAuthInfo://icube.cloudide'
$encryptedKey = $localState.os_crypt.encrypted_key

$keyBytes = [Convert]::FromBase64String($encryptedKey)
$keyBytes = $keyBytes[5..($keyBytes.Length - 1)]
$decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $keyBytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)

$authBytes = [Convert]::FromBase64String($authData)

$nonceOffset = 6
$nonceLength = 12
$nonce = New-Object byte[] $nonceLength
[Array]::Copy($authBytes, $nonceOffset, $nonce, 0, $nonceLength)

$tagOffset = $authBytes.Length - 16
$tag = New-Object byte[] 16
[Array]::Copy($authBytes, $tagOffset, $tag, 0, 16)

$ciphertextLength = $tagOffset - $nonceOffset - $nonceLength
$ciphertext = New-Object byte[] $ciphertextLength
[Array]::Copy($authBytes, ($nonceOffset + $nonceLength), $ciphertext, 0, $ciphertextLength)

try {
    $aes = New-Object System.Security.Cryptography.AesGcm($decryptedKey)
    $plaintext = New-Object byte[] $ciphertextLength
    $aes.Decrypt($nonce, $ciphertext, $tag, $plaintext, $null)
    $result = [System.Text.Encoding]::UTF8.GetString($plaintext)
    Write-Host "DECRYPTED_RESULT:$result"
} catch {
    Write-Host "OFFSET6_FAILED:$($_.Exception.Message)"

    $nonce2 = New-Object byte[] 12
    [Array]::Copy($authBytes, 8, $nonce2, 0, 12)
    $tag2 = New-Object byte[] 16
    [Array]::Copy($authBytes, ($authBytes.Length - 16), $tag2, 0, 16)
    $ct2Len = $authBytes.Length - 16 - 8 - 12
    $ct2 = New-Object byte[] $ct2Len
    [Array]::Copy($authBytes, 20, $ct2, 0, $ct2Len)

    try {
        $aes2 = New-Object System.Security.Cryptography.AesGcm($decryptedKey)
        $pt2 = New-Object byte[] $ct2Len
        $aes2.Decrypt($nonce2, $ct2, $tag2, $pt2, $null)
        $result2 = [System.Text.Encoding]::UTF8.GetString($pt2)
        Write-Host "DECRYPTED_RESULT_V2:$result2"
    } catch {
        Write-Host "OFFSET8_FAILED:$($_.Exception.Message)"
    }
}
