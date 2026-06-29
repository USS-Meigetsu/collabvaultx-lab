$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

$patterns = @(
  "edge-profile",
  "Login Data",
  "Cookies",
  "History",
  "Web Data",
  "Local State",
  "Preferences",
  "Secure Preferences",
  "Crashpad",
  "Cache",
  "source\.pdf",
  "tmp-"
)

$regex = ($patterns -join "|")
$tracked = git -C $repoRoot ls-files | Select-String -Pattern $regex
$untracked = git -C $repoRoot ls-files --others --exclude-standard | Select-String -Pattern $regex

if ($tracked -or $untracked) {
  Write-Error "Blocked unsafe or scratch files detected in the repository."
  if ($tracked) {
    Write-Host "`nTracked matches:"
    $tracked | ForEach-Object { Write-Host $_.Line }
  }
  if ($untracked) {
    Write-Host "`nUntracked matches:"
    $untracked | ForEach-Object { Write-Host $_.Line }
  }
  exit 1
}

Write-Host "Clean: no unsafe browser-profile or scratch files detected."
