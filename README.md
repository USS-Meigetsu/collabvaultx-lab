# collabvaultx-lab

Static GitHub Pages prototype for CollabVaultX, an English-first archive for
Japan-exclusive collaboration goods.

## Local checks

This project is currently plain HTML/CSS. Open `index.html` directly or serve the
repository root with any static file server.

Before committing, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-site.ps1
```

Do not commit browser profiles, cookies, login databases, local cache folders,
temporary screenshots, or source-capture PDFs.

## Content workflow

- Add one collaboration detail page under `works/<work>/collabs/<slug>/index.html`.
- Store public web assets under `assets/images/works/<work>/collabs/<slug>/`.
- Keep source URLs in the page's reference area when item rules or campaign facts
  are based on official pages.
- Keep local capture files, browser profiles, and automation state outside the
  repository.
