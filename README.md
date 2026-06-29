# collabvaultx-lab

Static GitHub Pages prototype for CollabVaultX, an English-first archive for
Japan-exclusive collaboration goods.

## Local checks

This project is currently plain HTML/CSS/vanilla JS. Open `index.html` directly
or serve the repository root with any static file server.

Before committing, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-site.ps1
```

The same check also runs in GitHub Actions on pushes to `main` and pull
requests.

Do not commit browser profiles, cookies, login databases, local cache folders,
temporary screenshots, or source-capture PDFs.

## Content workflow

- Add one collaboration detail page under `works/<work>/collabs/<slug>/index.html`.
- Store public web assets under `assets/images/works/<work>/collabs/<slug>/`.
- Keep source URLs in the page's reference area when item rules or campaign facts
  are based on official pages.
- Keep each published HTML page's canonical URL, Open Graph metadata, and
  `sitemap.xml` entry aligned with the public `CNAME` domain.
- Keep local capture files, browser profiles, and automation state outside the
  repository.

## Search metadata

- Shared search/filter behavior lives in `assets/js/site.js`.
- Top page title cards use `data-title-card`, `data-status`, and
  `data-search-keywords` so the quick search can filter work entries.
- Published collaboration cards use `data-status="published"` and are the only
  cards included in list filtering.
- Add `data-search-keywords` to published cards for spelling variants, English
  names, Japanese names, partner aliases, and major item types.
- Keep `data-category` broad and stable: `goods`, `clear-file`, `card`,
  `figure`, and `prize`. Item-specific words belong in `data-search-keywords`.
