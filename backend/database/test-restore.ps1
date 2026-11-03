<#
.SYNOPSIS
    Restore test (Ref 13.7): restores a backup into a temporary database, runs DBCC CHECKDB,
    compares row counts with the live database, then drops the temporary copy.
.EXAMPLE
    .\test-restore.ps1                      # uses the newest backup in the backup folder
    .\test-restore.ps1 -BackupFile "D:\Backups\NailsByLeah_20261101_020000.bak"
#>
param(
    [string]$Server = "(localdb)\MSSQLLocalDB",
    [string]$Database = "NailsByLeah",
    [string]$BackupDirectory = (Join-Path $env:USERPROFILE "NailsByLeahBackups"),
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

function Invoke-Sql([string]$Query) {
    $output = sqlcmd -S $Server -E -b -h -1 -W -s "|" -Q "SET NOCOUNT ON; $Query"
    if ($LASTEXITCODE -ne 0) { throw "SQL failed: $Query`n$output" }
    return $output
}

if (-not $BackupFile) {
    $latest = Get-ChildItem -Path $BackupDirectory -Filter "${Database}_*.bak" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { throw "No backups found in $BackupDirectory." }
    $BackupFile = $latest.FullName
}

$restoreDb = "${Database}_RestoreTest"
$restoreDir = Join-Path $BackupDirectory "restore-test"
New-Item -ItemType Directory -Force -Path $restoreDir | Out-Null

# Move every file in the backup to the scratch folder so the live database is never touched.
$moves = foreach ($line in Invoke-Sql "RESTORE FILELISTONLY FROM DISK = N'$BackupFile'") {
    $columns = $line.Split("|")
    if ($columns.Count -lt 3) { continue }
    $extension = if ($columns[2] -eq "L") { "ldf" } else { "mdf" }
    "MOVE N'$($columns[0])' TO N'$(Join-Path $restoreDir "$restoreDb`_$($columns[0]).$extension")'"
}

$tables = "users", "services", "addons", "bookings", "booking_addons", "payments", "cancellations", "audit_logs"
$passed = $false
try {
    Invoke-Sql "IF DB_ID(N'$restoreDb') IS NOT NULL BEGIN ALTER DATABASE [$restoreDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$restoreDb]; END" | Out-Null
    Invoke-Sql "RESTORE DATABASE [$restoreDb] FROM DISK = N'$BackupFile' WITH $($moves -join ', '), CHECKSUM, RECOVERY" | Out-Null
    Invoke-Sql "DBCC CHECKDB (N'$restoreDb') WITH NO_INFOMSGS" | Out-Null

    $report = foreach ($table in $tables) {
        [pscustomobject]@{
            Table    = $table
            Restored = [int](Invoke-Sql "SELECT COUNT(*) FROM [$restoreDb].dbo.[$table]")
            Live     = [int](Invoke-Sql "SELECT COUNT(*) FROM [$Database].dbo.[$table]")
        }
    }
    $report | Format-Table -AutoSize | Out-String | Write-Output
    if ($report | Where-Object { $_.Restored -ne $_.Live }) {
        Write-Warning "Some counts differ. That is expected if data changed after the backup was taken."
    }
    $passed = $true
}
finally {
    Invoke-Sql "IF DB_ID(N'$restoreDb') IS NOT NULL BEGIN ALTER DATABASE [$restoreDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$restoreDb]; END" | Out-Null
}

if ($passed) { Write-Output "RESTORE TEST PASSED: $BackupFile restored, passed DBCC CHECKDB, and was cleaned up." }
