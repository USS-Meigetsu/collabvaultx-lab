Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

& (Join-Path $scriptDir "check-clean-files.ps1")

$htmlFiles = Get-ChildItem -LiteralPath $repoRoot -Recurse -Filter "*.html" -File |
  Where-Object { $_.FullName -notmatch "\\.git\\" }

$mojibakeMarkers = @(
  [string][char]0x7E67,
  [string][char]0x7E3A,
  [string][char]0x8708,
  [string][char]0x9AE2,
  [string][char]0x87B3,
  [string][char]0x8373,
  [string][char]0xFFFD
)
$mojibakePattern = [string]::Join("|", $mojibakeMarkers)
$missingLinks = New-Object System.Collections.Generic.List[string]
$mojibakeFiles = New-Object System.Collections.Generic.List[string]
$placeholderLinks = New-Object System.Collections.Generic.List[string]

foreach ($file in $htmlFiles) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8

  if ($text -match $mojibakePattern) {
    $mojibakeFiles.Add($file.FullName)
  }

  $matches = [regex]::Matches($text, '(src|href)="([^"]+)"')
  foreach ($match in $matches) {
    $attr = $match.Groups[1].Value
    $url = $match.Groups[2].Value
    if ($attr -eq "href" -and $url -eq "#") {
      $relativeFile = Resolve-Path -LiteralPath $file.FullName -Relative
      $placeholderLinks.Add("$relativeFile -> href=`"#`"")
      continue
    }
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

if ($placeholderLinks.Count -gt 0) {
  Write-Error ("Placeholder href=`"#`" links found:`n" + ($placeholderLinks -join "`n"))
}

Write-Output "Site checks passed: $($htmlFiles.Count) HTML files, no mojibake markers, placeholder links, or missing local links."
