
Add-Type -AssemblyName System.Security
$dpapiKeyB64 = "AQAAANCMnd8BFdERjHoAwE/Cl+sBAAAAHGg/ADiTO0a1gRQE39bUURAAAAASAAAAQwBoAHIAbwBtAGkAdQBtAAAAEGYAAAABAAAgAAAAbO+PwLlgKhSeNI1LWy3yVDrMOXA7jxKoahsESonENOIAAAAADoAAAAACAAAgAAAAHUANHmlJyUaJEk5GLKeQKf94ykBwtjKO4blplKt4xmcwAAAAJIjioq5UgQldDI5rAy66WPvq+NagDBOuWOmsgEF2/iblKTsZfO0Mkzqv47pcCHnjQAAAAFLbCRQ4iV7EXuBqdsvFR1G1YDKNbAMsa02cs5N3l3/136LpPyARhecPsWiS5msh/nCN1i3/mr/KJgsPbgH+RsE="
$dpapiKeyBytes = [System.Convert]::FromBase64String($dpapiKeyB64)
$decryptedKey = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $dpapiKeyBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
$keyHex = [System.BitConverter]::ToString($decryptedKey).Replace('-', '').ToLower()
Write-Host "AES_KEY_HEX:$keyHex"
