# Item Page Template

This project still publishes hand-written static HTML. Item JSON is a validation
and future-generation scaffold, not the page generator yet.

Use this checklist when adding a published item group page under:

```text
works/<workId>/collabs/<campaignSlug>/items/<itemSlug>/index.html
```

## HTML Sections

- `head` metadata:
  - `<title>` with the official Japanese item name, campaign, and CollabVaultX.
  - `description`.
  - canonical URL on `https://lab.collabvaultx.com/`.
  - `og:site_name`, `og:type`, `og:title`, `og:description`, `og:url`,
    `og:image`, and `og:image:alt`.
  - `twitter:card` with `summary_large_image`.
  - `twitter:title`, `twitter:description`, and `twitter:image` aligned with
    the matching Open Graph metadata.
  - shared stylesheet path.
- Hero:
  - breadcrumb links to Top page, work page, and campaign page.
  - `h1` with the official or source-faithful Japanese item name.
  - Japanese item summary.
  - `hero-english-summary` with `lang="en"`.
  - hero image using eager/high-priority loading.
  - concise metadata lines for original acquisition or sale method.
- Overview cards:
  - acquisition or sale rule.
  - lineup, price, or quantity.
  - item-specific caveats such as random bonus, store limitations, size, or
    while-supplies-last notes.
- Product section:
  - `product-card product-card-wide`.
  - product image with `loading="lazy"` and `decoding="async"`.
  - `alt` matching the relevant `Asset.altJa`.
  - `item-fact-list` for official facts.
- Reference section:
  - `market-note` before secondary-market searches.
  - `Official source:`, `Checked date:`, and `Notes:` entries. For
    partner-official sources, keep `Official source:` in the label for
    validation and clarify the partner-official status in the text.
  - A concise archive/visual-asset note when a page relies on official imagery:
    thumbnails are for identification, rights remain with the relevant rights
    holders, and attribution does not imply permission or endorsement.
  - secondary-market links inside `market-links`.
  - same-campaign related item-page navigation.
  - back links to the campaign, work page, and Top page.

## Data Updates

- Add `summaryEn` to the matching `Item`.
- Add `page` only when the item page is actually published:

```json
"page": {
  "status": "published",
  "slug": "<itemSlug>",
  "path": "works/<workId>/collabs/<campaignSlug>/items/<itemSlug>/"
}
```

- Keep `page.path` under the parent campaign route.
- Add or verify `lineupLabelJa`, `priceLabel`, `availabilityLabel`, and
  `acquisitionMethodJa` when the official source supports them.
- Keep `sourceIds` limited to official or partner-official sources for verified
  facts. Marketplace references do not verify item facts.
- Keep `marketplaceSearches` as reference searches only.

## Parent Campaign Page

- Add `data-item-id="<Item.id>"` to the matching parent `product-card`.
- Add a visible `card-button` link from the parent item card to the item page.
- Keep official fact spans in `item-fact-list`.
- Keep eBay/Mercari/Suruga-ya or similar searches in `market-links`.

## Sitemap

- Add the item page public URL.
- Update the parent campaign `lastmod` when the parent page changes.

## Validation

Run before commit:

```powershell
node --check assets/js/site.js
node --check scripts/check-data.mjs
node --check scripts/check-data-html-sync.mjs
node scripts/check-data.mjs
node scripts/check-data-html-sync.mjs
powershell -ExecutionPolicy Bypass -File scripts/check-site.ps1
git diff --check
```

`scripts/check-data-html-sync.mjs` auto-discovers `Item` records whose
`page.status` is `published`. For each one, it checks page existence, canonical
URL, `og:url`, sitemap URL, parent `data-item-id` card link, official name,
English summary, source facts, every official or partner-official source URL,
marketplace URLs, related item-page navigation, hero image loading policy,
product image metadata, and product image path.

## Browser QA

- Parent item card link navigates to the item page.
- Related item-page navigation works.
- Desktop and mobile viewports have no horizontal overflow.
- Official source links and secondary-market links are visually separated.
- Product images retain `loading="lazy"` and `decoding="async"`.
- For visible UI changes, create local red-box before/after screenshots for the
  changed route and viewport. Keep these review artifacts out of git.

## Negative Checks

Use a temp copy, not the working tree, to confirm failures:

- Publishing an `Item.page` without an HTML page fails validation.
- Removing `data-item-id` from the parent product card fails sync.
- Changing canonical or `og:url` fails sync.
- Removing the official source URL fails sync.
- Removing one marketplace URL fails sync.
- Removing product image `loading` or `decoding` fails Site Check.
