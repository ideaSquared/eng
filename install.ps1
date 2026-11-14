# eng installer for Windows (PowerShell). Run:
#   irm https://raw.githubusercontent.com/ideaSquared/eng/main/install.ps1 | iex
# It installs what eng needs (Node 22, pnpm, git, the GitHub CLI) with winget, then the eng CLI, then runs `eng setup`.
$ErrorActionPreference = 'Stop'

function Say($text) { Write-Host "`n-> $text" }
function Has($command) { [bool](Get-Command $command -ErrorAction SilentlyContinue) }
# Adds newly saved PATH entries without dropping ones only this session has (such as an fnm Node).
function Refresh-Path {
  $saved = ([Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')).Split(';')
  $current = $env:Path.Split(';')
  $env:Path = (($current + ($saved | Where-Object { $_ -and ($current -notcontains $_) })) -join ';')
}
# Native commands do not stop the script on failure by themselves.
function Invoke-Checked {
  & $args[0] @($args | Select-Object -Skip 1)
  if ($LASTEXITCODE -ne 0) { throw "$($args -join ' ') failed (exit code $LASTEXITCODE)." }
}
function Test-Pnpm {
  if (-not (Has pnpm.cmd)) { return $false }
  return [int]((pnpm.cmd --version).Split('.')[0]) -ge 10
}
function Test-Node {
  if (-not (Has node)) { return $false }
  $parts = (node --version).TrimStart('v').Split('.')
  return ([int]$parts[0] -gt 22) -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 18)
}
function Install-Winget($id, $name) {
  Say "Installing $name"
  Invoke-Checked winget install --id $id --exact --silent --accept-source-agreements --accept-package-agreements
  Refresh-Path
}

if (-not (Has winget)) { throw 'winget is missing. Install "App Installer" from the Microsoft Store, then run this again.' }
if (-not (Test-Node)) { Install-Winget 'OpenJS.NodeJS.LTS' 'Node' }
if (-not (Has git)) { Install-Winget 'Git.Git' 'git' }
if (-not (Has gh)) { Install-Winget 'GitHub.cli' 'the GitHub CLI' }
# The .cmd shims run under the default Restricted execution policy; npm's .ps1 shims do not.
if (-not (Test-Pnpm)) { Say 'Installing pnpm 10'; Invoke-Checked npm.cmd install -g pnpm@10; Refresh-Path }

# pnpm needs a global bin folder on PATH; `pnpm setup` adds PNPM_HOME to your user environment.
pnpm.cmd setup | Out-Null
$env:PNPM_HOME = [Environment]::GetEnvironmentVariable('PNPM_HOME', 'User')
Refresh-Path
if ($env:PNPM_HOME) { $env:Path = "$env:PNPM_HOME;$env:Path" }

Say 'Installing eng'
Invoke-Checked pnpm.cmd add -g github:ideaSquared/eng
Invoke-Checked eng.cmd setup

Write-Host "`nDone. Open a new terminal so the PATH changes apply everywhere. Keep up to date with: eng update"
