$envFile = Join-Path $PSScriptRoot ".env.local"
$environments = @("production", "preview", "development")

$lines = Get-Content $envFile

foreach ($line in $lines) {
    $line = $line.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { continue }

    $idx = $line.IndexOf("=")
    if ($idx -lt 0) { continue }

    $key   = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()

    # Strip wrapping quotes
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    foreach ($env in $environments) {
        Write-Host "[$env] $key ..."
        vercel env rm $key $env --yes 2>$null
        $value | vercel env add $key $env
    }
}

Write-Host ""
Write-Host "=== vercel env ls ==="
vercel env ls
