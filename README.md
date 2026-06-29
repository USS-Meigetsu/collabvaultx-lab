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
- Published collaboration cards should include a `card-meta-list` with `Period`,
  `Source`, and `Items`; CI fails if these are missing.
- Add `data-search-keywords` to published cards for spelling variants, English
  names, Japanese names, partner aliases, and major item types.
- Keep `data-category` broad and stable: `goods`, `clear-file`, `card`,
  `figure`, and `prize`. Item-specific words belong in `data-search-keywords`.

## English-first display rules

- Keep official Japanese campaign titles and item names intact.
- Add a short English summary to every published title/collaboration card so
  English readers can understand the entry before opening the detail page.
- Add a short `hero-english-summary` to every collaboration detail page.
- Use `lang="en"` on English summary paragraphs.
- Do not mass-translate official Japanese names; pair a concise English
  explanation with the original name instead.

## Category rules

- `goods`: sale goods, popup shop goods, campaign merchandise, and broad item
  collections.
- `clear-file`: clear files and clear-file style purchase bonuses.
- `card`: paper/plastic cards, postcards, and card-shaped bonuses.
- `figure`: acrylic stands, acrylic panels, standees, and figure-like display
  goods.
- `prize`: lottery prizes, crane-game prizes, facility-use bonuses, and other
  reward-style items.

When an entry mixes sales goods, menu bonuses, lottery prizes, and facility
benefits, keep the categories broad and put the detailed item words in
`data-search-keywords` and the detail page body.

## Source rules

- Each detail page should include an `Official source`, `Checked date`, and
  `Notes` block.
- Treat page content as a record of what was confirmed on the checked date,
  especially when official campaign pages may disappear later.
- Use marketplace links as reference searches only; do not present them as
  official purchase sources.
- Detail pages with marketplace/search links should show a `market-note`
  before the item cards.
- Do not add campaign periods, store counts, item rules, or bonus conditions
  unless they are backed by an official source or clearly labeled as a later
  verification target.
