<#
.SYNOPSIS
    Full database backup with checksum verification and retention cleanup (Ref 13.7).
.EXAMPLE
    .\backup-database.ps1
    .\backup-database.ps1 -Server "myserver" -BackupDirectory "D:\Backups" -RetentionDays 30
#>
param(
    [string]$Server = "(localdb)\MSSQLLocalDB",
    [string]$Database = "NailsByLeah",
    [string]$BackupDirectory = (Join-Path $env:USERPROFILE "NailsByLeahBackups"),
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null

$file = Join-Path $BackupDirectory ("{0}_{1:yyyyMMdd_HHmmss}.bak" -f $Database, (Get-Date))

sqlcmd -S $Server -E -b -Q "BACKUP DATABASE [$Database] TO DISK = N'$file' WITH INIT, CHECKSUM, NAME = N'$Database daily backup'"
if ($LASTEXITCODE -ne 0) { throw "Backup of $Database failed." }

sqlcmd -S $Server -E -b -Q "RESTORE VERIFYONLY FROM DISK = N'$file' WITH CHECKSUM"
if ($LASTEXITCODE -ne 0) { throw "Backup file $file failed verification." }

Get-ChildItem -Path $BackupDirectory -Filter "${Database}_*.bak" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    Remove-Item

Write-Output "Backup written and verified: $file"
