$taskName = 'DA-System-SC-WSL-KeepAlive'
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\wsl.exe" -Argument '-d Ubuntu --exec /usr/bin/sleep infinity'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "已创建并启动 WSL 常驻任务：$taskName"
