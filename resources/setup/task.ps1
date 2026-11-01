param(
  [string]$Exe,
  [switch]$Enable,
  [switch]$Disable,
  [switch]$Remove
)

$name = 'UltraGMonitor'

if ($Remove) {
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  exit 0
}

if ($Disable) {
  Disable-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue | Out-Null
  exit 0
}

if ($Enable -and (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue)) {
  Enable-ScheduledTask -TaskName $name | Out-Null
  exit 0
}

$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $Exe -Argument '--autostart'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
