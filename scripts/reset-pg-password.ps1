<#
  Reset the PostgreSQL 18 `postgres` superuser password (local dev).

  Run from an **Administrator** PowerShell:
      powershell -ExecutionPolicy Bypass -File .\scripts\reset-pg-password.ps1

  It will prompt for a new password (input hidden), then:
    1. back up pg_hba.conf
    2. switch local auth to `trust`
    3. restart the service
    4. ALTER USER postgres with the new password
    5. restore the original pg_hba.conf
    6. restart again (back to scram-sha-256)

  After it finishes, put the new password into DATABASE_URL in your .env.
#>

$ErrorActionPreference = "Stop"

$pgRoot   = "C:\Program Files\PostgreSQL\18"
$hbaPath  = Join-Path $pgRoot "data\pg_hba.conf"
$psql     = Join-Path $pgRoot "bin\psql.exe"
$service  = "postgresql-x64-18"
$backup   = "$hbaPath.bak"

# --- must be elevated ---
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Run this from an Administrator PowerShell."
    exit 1
}

$sec  = Read-Host "New postgres password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
if ([string]::IsNullOrWhiteSpace($plain)) { Write-Error "Empty password."; exit 1 }

Write-Host "1/6 Backing up pg_hba.conf -> $backup"
Copy-Item $hbaPath $backup -Force

Write-Host "2/6 Switching local auth to trust"
$content = Get-Content $hbaPath
$trusted = $content -replace '(^(local|host)\s+all\s+all\s+\S*\s*)(scram-sha-256|md5)\s*$', '$1trust'
Set-Content $hbaPath $trusted -Encoding ascii

Write-Host "3/6 Restarting $service"
Restart-Service $service -Force
Start-Sleep -Seconds 3

Write-Host "4/6 Setting new password"
$env:PGPASSWORD = ""
& $psql -U postgres -h 127.0.0.1 -p 5432 -d postgres -v ON_ERROR_STOP=1 `
    -c "ALTER USER postgres WITH PASSWORD '$plain';"

Write-Host "5/6 Restoring pg_hba.conf"
Copy-Item $backup $hbaPath -Force
Remove-Item $backup -Force

Write-Host "6/6 Restarting $service"
Restart-Service $service -Force
Start-Sleep -Seconds 3

$plain = $null
Write-Host "`nDone. Now set this password in DATABASE_URL inside your .env." -ForegroundColor Green
