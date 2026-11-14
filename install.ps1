# eng installer for Windows (PowerShell). Run:
#   irm https://raw.githubusercontent.com/ideaSquared/eng/main/install.ps1 | iex
# It installs what eng needs (Node 22, pnpm, git, the GitHub CLI) with winget, then the eng CLI, then runs `eng setup`.
$ErrorActionPreference = 'Stop'

function Say($text) { Write-Host "`n-> $text" }
function Has($command) { [bool](Get-Command $command -ErrorAction SilentlyContinue) }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Test-Node {
  if (-not (Has node)) { return $false }
  $parts = (node --version).TrimStart('v').Split('.')
  return ([int]$parts[0] -gt 22) -or ([int]$parts[0] -eq 22 -and [int]$parts[1] -ge 18)
}
function Install-Winget($id, $name) {
  Say "Installing $name"
  winget install --id $id --exact --silent --accept-source-agreements --accept-package-agreements
  Refresh-Path
}

if (-not (Has winget)) { throw 'winget is missing. Install "App Installer" from the Microsoft Store, then run this again.' }
if (-not (Test-Node)) { Install-Winget 'OpenJS.NodeJS.LTS' 'Node' }
if (-not (Has git)) { Install-Winget 'Git.Git' 'git' }
if (-not (Has gh)) { Install-Winget 'GitHub.cli' 'the GitHub CLI' }
if (-not (Has pnpm)) { Say 'Installing pnpm'; npm install -g pnpm@10; Refresh-Path }

# pnpm needs a global bin folder on PATH; `pnpm setup` adds PNPM_HOME to your user environment.
pnpm setup | Out-Null
$env:PNPM_HOME = [Environment]::GetEnvironmentVariable('PNPM_HOME', 'User')
Refresh-Path
if ($env:PNPM_HOME) { $env:Path = "$env:PNPM_HOME;$env:Path" }

Say 'Installing eng'
pnpm add -g github:ideaSquared/eng
eng setup

Write-Host "`nDone. Open a new terminal so the PATH changes apply everywhere. Keep up to date with: eng update"
