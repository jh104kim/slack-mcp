$ErrorActionPreference = "Stop"

$taskName = "GPters MCP Social Digest"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$npm = (Get-Command npm.cmd).Source
$action = New-ScheduledTaskAction -Execute $npm -Argument "run gpters:social" -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.AddHours(6).AddMinutes(30))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Posts the daily GPTers MCP top-liked summary to Slack #소셜." `
  -Force | Out-Null

Write-Host "Registered scheduled task: $taskName"
Write-Host "Run manually with: npm run gpters:social"
