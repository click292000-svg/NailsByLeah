<#
.SYNOPSIS
    Registers a Windows Scheduled Task that runs backup-database.ps1 every day (Ref 13.7).
    Run once, from an elevated PowerShell if your policy requires it.
.EXAMPLE
    .\register-daily-backup.ps1 -At "02:00"
#>
param(
    [string]$At = "02:00",
    [string]$TaskName = "NailsByLeah Daily Database Backup"
)

$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "backup-database.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable:$false

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Full backup of the NailsByLeah database" -Force | Out-Null
Write-Output "Scheduled task '$TaskName' runs daily at $At."
