# Registers a scheduled task that starts the NSA presence agent at logon.
# Run from PowerShell: powershell -ExecutionPolicy Bypass -File install\install-windows-task.ps1
$ErrorActionPreference = 'Stop'

$script = Join-Path $PSScriptRoot 'start-agent.vbs'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$script`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName 'NSA Presence Agent' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Shows the Nintendo Switch presence as Discord Rich Presence' -Force | Out-Null

Write-Host "Scheduled task 'NSA Presence Agent' registered. Start it now with: Start-ScheduledTask -TaskName 'NSA Presence Agent'"
