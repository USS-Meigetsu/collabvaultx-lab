Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

& (Join-Path $scriptDir "check-clean-files.ps1")

$htmlFiles = Get-ChildItem -LiteralPath $repoRoot -Recurse -Filter "*.html" -File |
  Where-Object { $_.FullName -notmatch "\\.git\\" }

$mojibakePattern = "繧|縺|蜈|髢|螳|荳|�"
$missingLinks = New-Object System.Collections.Generic.List[string]
$mojibakeFiles = New-Object System.Collections.Generic.List[string]

foreach ($file in $htmlFiles) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8

  if ($text -match $mojibakePattern) {
    $mojibakeFiles.Add($file.FullName)
  }

  $matches = [regex]::Matches($text, '(?:src|href)="([^"]+)"')
  foreach ($match in $matches) {
    $url = $match.Groups[1].Value
    if ($url -eq "" -or $url.StartsWith("#")) { continue }
    if ($url -match "^(https?:|mailto:|tel:|javascript:)") { continue }

    $cleanUrl = ($url -split "#")[0]
    $cleanUrl = ($cleanUrl -split "\?")[0]
    if ($cleanUrl -eq "") { continue }

    $target = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $cleanUrl))
    if (-not (Test-Path -LiteralPath $target)) {
      $relativeFile = Resolve-Path -LiteralPath $file.FullName -Relative
      $missingLinks.Add("$relativeFile -> $url")
    }
  }
}

if ($mojibakeFiles.Count -gt 0) {
  Write-Error ("Possible mojibake markers found:`n" + ($mojibakeFiles -join "`n"))
}

if ($missingLinks.Count -gt 0) {
  Write-Error ("Missing local links found:`n" + ($missingLinks -join "`n"))
}

Write-Output "Site checks passed: $($htmlFiles.Count) HTML files, no mojibake markers or missing local links."
