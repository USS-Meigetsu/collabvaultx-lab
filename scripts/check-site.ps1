Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$siteHostPath = Join-Path $repoRoot "CNAME"
$siteHost = ""
if (Test-Path -LiteralPath $siteHostPath) {
  $siteHost = (Get-Content -LiteralPath $siteHostPath -Raw -Encoding UTF8).Trim()
}
$siteBaseUrl = ""
if ($siteHost -ne "") {
  $siteBaseUrl = "https://$siteHost"
}

& (Join-Path $scriptDir "check-clean-files.ps1")

$htmlFiles = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -Filter "*.html" -File |
  Where-Object { $_.FullName -notmatch "\\.git\\" })
$cssFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "assets") -Recurse -Filter "*.css" -File)
$jsFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot "assets") -Recurse -Filter "*.js" -File)

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
$unsafeBlankTargets = New-Object System.Collections.Generic.List[string]
$unsafeJavascriptLinks = New-Object System.Collections.Generic.List[string]
$missingMetadata = New-Object System.Collections.Generic.List[string]
$missingCardMetadata = New-Object System.Collections.Generic.List[string]
$missingEnglishSummaries = New-Object System.Collections.Generic.List[string]
$publicPlaceholderText = New-Object System.Collections.Generic.List[string]
$publicUrls = New-Object System.Collections.Generic.List[string]

$publicPlaceholderTerms = @(
  "作品A",
  "作品B",
  "作品C",
  "ファミレスA",
  "ファミレスB"
)

function Get-RelativePathForReport([string]$path) {
  return Resolve-Path -LiteralPath $path -Relative
}

function Get-RepositoryRelativePath([string]$path) {
  $trimChars = [char[]]@([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $fullRoot = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd($trimChars) + [System.IO.Path]::DirectorySeparatorChar
  $fullPath = [System.IO.Path]::GetFullPath($path)

  if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside repository root: $path"
  }

  return ($fullPath.Substring($fullRoot.Length) -replace "\\", "/")
}

function Get-PublicPathForHtmlFile([System.IO.FileInfo]$file) {
  $relativePath = Get-RepositoryRelativePath $file.FullName
  if ($relativePath -eq "index.html") {
    return "/"
  }
  if ($relativePath.EndsWith("/index.html")) {
    return "/" + $relativePath.Substring(0, $relativePath.Length - "index.html".Length)
  }
  return "/" + $relativePath
}

function Test-SkippableUrl([string]$url) {
  return $url -eq "" -or
    $url.StartsWith("#") -or
    $url -match "^(https?:|mailto:|tel:|data:)"
}

function Add-MissingLocalReference([System.IO.FileInfo]$file, [string]$url) {
  if (Test-SkippableUrl $url) { return }

  $cleanUrl = ($url -split "#")[0]
  $cleanUrl = ($cleanUrl -split "\?")[0]
  if ($cleanUrl -eq "") { return }

  $target = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $cleanUrl))
  if (-not (Test-Path -LiteralPath $target)) {
    $relativeFile = Get-RelativePathForReport $file.FullName
    $missingLinks.Add("$relativeFile -> $url")
  }
}

foreach ($file in $htmlFiles) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  $relativeFile = Get-RelativePathForReport $file.FullName
  $repositoryRelativePath = Get-RepositoryRelativePath $file.FullName

  if ($text -match $mojibakePattern) {
    $mojibakeFiles.Add($file.FullName)
  }

  foreach ($term in $publicPlaceholderTerms) {
    if ($text.Contains($term)) {
      $publicPlaceholderText.Add("$relativeFile -> $term")
    }
  }

  if ($repositoryRelativePath -match '^works/umamusume/collabs/[^/]+/index\.html$' -and
      $text -notmatch 'class="[^"]*\bhero-english-summary\b[^"]*"\s+lang="en"') {
    $missingEnglishSummaries.Add("$relativeFile -> missing hero-english-summary lang=en")
  }

  $availableTitleCardMatches = [regex]::Matches($text, '<article\b(?=[^>]*data-title-card)(?=[^>]*data-status="available")[\s\S]*?</article>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  foreach ($match in $availableTitleCardMatches) {
    $article = $match.Value
    $idMatch = [regex]::Match($article, 'id="([^"]+)"')
    $articleLabel = "available title card"
    if ($idMatch.Success) {
      $articleLabel = $idMatch.Groups[1].Value
    }

    if ($article -notmatch 'class="[^"]*\benglish-summary\b[^"]*"\s+lang="en"') {
      $missingEnglishSummaries.Add("$relativeFile -> $articleLabel missing english-summary lang=en")
    }
  }

  if ($siteBaseUrl -ne "") {
    $expectedUrl = $siteBaseUrl + (Get-PublicPathForHtmlFile $file)
    $publicUrls.Add($expectedUrl)
    $escapedExpectedUrl = [regex]::Escape($expectedUrl)

    if ($text -notmatch ('<link\s+rel="canonical"\s+href="' + $escapedExpectedUrl + '"\s*/?>')) {
      $missingMetadata.Add("$relativeFile -> missing canonical $expectedUrl")
    }
    if ($text -notmatch '<meta\s+property="og:title"\s+content="[^"]+"\s*/?>') {
      $missingMetadata.Add("$relativeFile -> missing og:title")
    }
    if ($text -notmatch '<meta\s+property="og:description"\s+content="[^"]+"\s*/?>') {
      $missingMetadata.Add("$relativeFile -> missing og:description")
    }
    if ($text -notmatch ('<meta\s+property="og:url"\s+content="' + $escapedExpectedUrl + '"\s*/?>')) {
      $missingMetadata.Add("$relativeFile -> missing og:url $expectedUrl")
    }
    if ($text -notmatch ('<meta\s+property="og:image"\s+content="' + [regex]::Escape($siteBaseUrl) + '/[^"]+"\s*/?>')) {
      $missingMetadata.Add("$relativeFile -> missing absolute og:image")
    }
    if ($text -notmatch '<meta\s+name="twitter:card"\s+content="summary_large_image"\s*/?>') {
      $missingMetadata.Add("$relativeFile -> missing twitter summary_large_image card")
    }
  }

  $attrMatches = [regex]::Matches($text, '\b(src|href)\s*=\s*(["''])(.*?)\2', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  foreach ($match in $attrMatches) {
    $attr = $match.Groups[1].Value.ToLowerInvariant()
    $url = $match.Groups[3].Value
    if ($attr -eq "href" -and $url.Trim() -eq "#") {
      $placeholderLinks.Add("$relativeFile -> href=`"#`"")
      continue
    }
    if ($attr -eq "href" -and $url.Trim() -match "(?i)^javascript:") {
      $unsafeJavascriptLinks.Add("$relativeFile -> $url")
      continue
    }
    Add-MissingLocalReference $file $url
  }

  $srcsetMatches = [regex]::Matches($text, '\bsrcset\s*=\s*(["''])(.*?)\1', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  foreach ($match in $srcsetMatches) {
    $entries = $match.Groups[2].Value -split ","
    foreach ($entry in $entries) {
      $candidate = ($entry.Trim() -split "\s+")[0]
      Add-MissingLocalReference $file $candidate
    }
  }

  $blankTargetMatches = [regex]::Matches($text, '<a\b(?=[^>]*\btarget\s*=\s*(["''])_blank\1)[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  foreach ($match in $blankTargetMatches) {
    $tag = $match.Value
    $relMatch = [regex]::Match($tag, '\brel\s*=\s*(["''])(.*?)\1', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $relTokens = @()
    if ($relMatch.Success) {
      $relTokens = $relMatch.Groups[2].Value.ToLowerInvariant() -split "\s+"
    }
    if (-not ($relTokens -contains "noopener") -or -not ($relTokens -contains "noreferrer")) {
      $unsafeBlankTargets.Add("$relativeFile -> $tag")
    }
  }

  $publishedCardMatches = [regex]::Matches($text, '<article\b(?=[^>]*data-status="published")[\s\S]*?</article>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  foreach ($match in $publishedCardMatches) {
    $article = $match.Value
    $idMatch = [regex]::Match($article, 'id="([^"]+)"')
    $articleLabel = "published card"
    if ($idMatch.Success) {
      $articleLabel = $idMatch.Groups[1].Value
    }

    if ($article -notmatch 'class="[^"]*\bcard-meta-list\b[^"]*"') {
      $missingCardMetadata.Add("$relativeFile -> $articleLabel missing card-meta-list")
      continue
    }
    $searchKeywordsMatch = [regex]::Match($article, '\bdata-search-keywords\s*=\s*(["''])(.*?)\1', [System.Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $searchKeywordsMatch.Success -or $searchKeywordsMatch.Groups[2].Value.Trim() -eq "") {
      $missingCardMetadata.Add("$relativeFile -> $articleLabel missing data-search-keywords")
    }

    foreach ($term in @("Period", "Source", "Items")) {
      if ($article -notmatch ("<dt>" + [regex]::Escape($term) + "</dt>")) {
        $missingCardMetadata.Add("$relativeFile -> $articleLabel missing card metadata term: $term")
      }
    }
    if ($article -notmatch 'class="[^"]*\benglish-summary\b[^"]*"\s+lang="en"') {
      $missingEnglishSummaries.Add("$relativeFile -> $articleLabel missing english-summary lang=en")
    }
  }
}

foreach ($file in $cssFiles) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  if ($text -match $mojibakePattern) {
    $mojibakeFiles.Add($file.FullName)
  }

  $urlMatches = [regex]::Matches($text, 'url\((["'']?)([^"''\)]+)\1\)')
  foreach ($match in $urlMatches) {
    Add-MissingLocalReference $file $match.Groups[2].Value.Trim()
  }
}

foreach ($file in $jsFiles) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  if ($text -match $mojibakePattern) {
    $mojibakeFiles.Add($file.FullName)
  }
}

if ($siteBaseUrl -ne "") {
  $robotsPath = Join-Path $repoRoot "robots.txt"
  $sitemapPath = Join-Path $repoRoot "sitemap.xml"
  $expectedSitemapUrl = "$siteBaseUrl/sitemap.xml"

  if (-not (Test-Path -LiteralPath $robotsPath)) {
    $missingMetadata.Add("robots.txt -> missing")
  } else {
    $robotsText = Get-Content -LiteralPath $robotsPath -Raw -Encoding UTF8
    if ($robotsText -notmatch ('(?m)^Sitemap:\s*' + [regex]::Escape($expectedSitemapUrl) + '\s*$')) {
      $missingMetadata.Add("robots.txt -> missing Sitemap: $expectedSitemapUrl")
    }
  }

  if (-not (Test-Path -LiteralPath $sitemapPath)) {
    $missingMetadata.Add("sitemap.xml -> missing")
  } else {
    $sitemapText = Get-Content -LiteralPath $sitemapPath -Raw -Encoding UTF8
    foreach ($url in $publicUrls) {
      if ($sitemapText -notmatch ('<loc>' + [regex]::Escape($url) + '</loc>')) {
        $missingMetadata.Add("sitemap.xml -> missing $url")
      }
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

if ($unsafeBlankTargets.Count -gt 0) {
  Write-Error ("target=`"_blank`" links must include rel=`"noopener noreferrer`":`n" + ($unsafeBlankTargets -join "`n"))
}

if ($unsafeJavascriptLinks.Count -gt 0) {
  Write-Error ("javascript: href links are not allowed:`n" + ($unsafeJavascriptLinks -join "`n"))
}

if ($missingMetadata.Count -gt 0) {
  Write-Error ("Missing public metadata found:`n" + ($missingMetadata -join "`n"))
}

if ($missingCardMetadata.Count -gt 0) {
  Write-Error ("Missing published card metadata found:`n" + ($missingCardMetadata -join "`n"))
}

if ($missingEnglishSummaries.Count -gt 0) {
  Write-Error ("Missing English summary text found:`n" + ($missingEnglishSummaries -join "`n"))
}

if ($publicPlaceholderText.Count -gt 0) {
  Write-Error ("Public placeholder title text found:`n" + ($publicPlaceholderText -join "`n"))
}

Write-Output "Site checks passed: $($htmlFiles.Count) HTML files, $($cssFiles.Count) CSS files, $($jsFiles.Count) JS files, metadata, sitemap, robots, published card metadata, English summaries, no mojibake markers, public placeholder title text, placeholder links, javascript links, missing local links, or unsafe blank-target links."
