# eng installer for Windows (PowerShell). Run:
#   irm https://raw.githubusercontent.com/ideaSquared/eng/main/install.ps1 | iex
# It installs what eng needs (Node 24, pnpm, git, the GitHub CLI) with winget, then the eng CLI, then runs `eng setup`.
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
  return [int]$parts[0] -ge 24
}
# pnpm 11 keeps global bins in PNPM_HOME\bin. Shims that pnpm 10 left at the top of PNPM_HOME come earlier on PATH and
# keep running the old ship, idea and eng. Remove only those three names, and only files that are pnpm shims.
function Test-PnpmShim($path) {
  $item = Get-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if (-not $item -or $item.PSIsContainer -or $item.LinkType -or $item.Length -ge 8192) { return $false }
  $text = Get-Content -LiteralPath $path -Raw
  return ($text -match 'basedir|%~dp0|PSScriptRoot') -and ($text -match '[/\\]global[/\\]') -and ($text -match 'node_modules')
}
function Remove-StaleShims($pnpmHome, $binDir) {
  if (-not $pnpmHome -or -not $binDir) { return }
  if ($pnpmHome.TrimEnd('\', '/') -ieq $binDir.TrimEnd('\', '/')) { return }
  foreach ($name in 'ship', 'idea', 'eng') {
    foreach ($ext in '', '.cmd', '.ps1') {
      $file = Join-Path $pnpmHome "$name$ext"
      if (Test-PnpmShim $file) { Remove-Item -LiteralPath $file -Force }
    }
  }
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
# The global bin comes first on PATH: it is PNPM_HOME\bin with pnpm 11, PNPM_HOME itself before.
$globalBin = $null
try { $globalBin = (pnpm.cmd bin -g 2>$null | Select-Object -First 1) } catch { $globalBin = $null }
if ($globalBin) { $env:Path = "$globalBin;$env:Path" }

Say 'Installing eng'
Invoke-Checked pnpm.cmd add -g github:ideaSquared/eng
Remove-StaleShims $env:PNPM_HOME $globalBin
Invoke-Checked eng.cmd setup

Write-Host "`nDone. Open a new terminal so the PATH changes apply everywhere. Keep up to date with: eng update"
