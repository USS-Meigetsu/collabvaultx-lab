# Componentization Boundaries

This project is still a hand-written static site. Shared CSS, JSON data, and
validation scripts already provide some common behavior, but HTML sections are
not generated yet.

This document decides which parts should become shared components next, which
parts should stay page-specific for now, and which parts should wait until the
content model is more stable.

## Current Position

- Shared now: global CSS, visual component classes, JSON data records, sitemap
  expectations, metadata validation, marketplace link validation, item-page sync
  checks, the Marketplace Finder renderer/checker, the related item navigation
  renderer/checker, and supported campaign product-grid renderer/checker.
- Hand-written now: item page HTML, campaign page HTML, official-source notes,
  item descriptions, overview cards, and page-specific reference/source blocks.
- Best next step: keep generated-block checks small and targeted before
  attempting broader page generation.

## Commonize Now

These areas are stable enough to become shared components or generated blocks.

### Marketplace Finder

Commonize first.

- Source: `Item.marketplaceSearches` and `Item.marketplaceFinder`.
- Output: the `section.marketplace-finder` block.
- Shared behavior:
  - grouped marketplace links
  - `finderGroup` visual grouping
  - `data-marketplace-finder`
  - `data-marketplace-id`
  - `data-marketplace-group`
  - rel tokens
  - non-affiliate and future-affiliate rules
  - reference-search disclaimer
- Keep item-specific:
  - exact search queries
  - `finderGroup` assignment when item type or marketplace behavior needs it
  - which platforms are useful for that item

Recommended implementation:

```text
scripts/render-marketplace-finder.mjs
```

The script should render or verify the Finder block for Finder-enabled items
without generating the whole item page.

Current workflow:

```text
node scripts/render-marketplace-finder.mjs --check
```

The checker compares each published Finder block with the canonical renderer
output. This keeps item pages hand-written while preventing drift in the shared
Finder section.

### Marketplace Link Policy

Keep the policy shared.

- Non-affiliate links use `nofollow noopener noreferrer`.
- Future affiliate links use `sponsored noopener noreferrer`.
- Affiliate links require visible disclosure.
- Official source links never count as marketplace links.

### Related Item Navigation

Commonized after Marketplace Finder.

- Source: published items in the same campaign.
- Output: the `section[aria-labelledby="related-items-heading"]` block.
- Shared behavior:
  - current page uses `aria-current="page"`
  - sibling pages link by relative URL
  - order follows `Campaign.itemIds`
  - same-campaign published items appear exactly once
  - cross-campaign items are rejected

Keep item-specific:

- display labels still come from the official item names in JSON.

Current workflow:

```text
node scripts/render-related-items.mjs --check
```

The checker compares each published item page's related navigation with the
canonical renderer output. `--write` may update only that block, and the diff
must be reviewed before commit.

### Parent Campaign Item Card Links

Keep this shared through validation now.

- Product image and title link to the item page.
- Separate detail-page buttons are not used for item-card navigation.
- Parent cards may show a curated subset of marketplace links.
- The ROUND1, Lawson, and COCOS parent campaign product grids are
  rendered/checked by `scripts/render-campaign-product-grid.mjs`.
- Parent-card-only display copy can use `Item.productGrid.descriptionJa` when it
  needs to stay shorter than the item-page description.
- Parent-card-only tags, facts, and preserved anchors can use `Item.productGrid`
  so the generated block stays data-backed without generating the whole page.

Broader full-page generation can wait until this focused product-grid contract
is stable.

### Common Page Metadata Rules

Keep as shared validation now.

- canonical URL
- `og:url`
- `og:image`
- `twitter:*`
- sitemap entry

Generation can wait until page templates stabilize.

## Keep Page-Specific For Now

These parts are still content-heavy and should stay hand-written or reviewed
per page.

### Hero Copy

Keep page-specific.

- Japanese official/source-faithful summary
- English reader summary
- important caveats about the campaign or item
- image framing and hero asset choice

Reason: this text carries context and should not become generic too early.

### Overview Cards

Keep page-specific.

- acquisition rules
- lineup counts
- prices
- stock/end-condition caveats
- store-specific limitations
- lottery/application windows

Reason: these are the highest-risk fact areas. They should stay close to
official sources and human review.

### Product Details

Keep page-specific for now.

- item-specific descriptions
- lineup nuance
- purchase or distribution method
- special notes such as random distribution, prize rarity, receipt entry, or
  reservation pickup

Reason: the schema is improving, but there are still differences between cards,
food, acrylic goods, lotteries, web lotteries, and reservation goods.

### Official Source Blocks

Keep page-specific, but validate them.

- visible official or partner-official source links
- checked date
- notes about what the source verifies

Reason: source scope and caveats vary per campaign. Common generation should
wait until source records fully represent those caveats.

### Marketplace Search Terms

Keep item-specific even after the Finder block is generated.

- platform choice
- query wording
- intent choice
- Japanese versus English search terms

Reason: useful search terms depend heavily on item type and real marketplace
language.

## Commonize Later

These are good targets, but not before the Finder and related navigation settle.

### Item Page Scaffold

Later target.

Generate the repeated page structure after all Lawson/COCOS item pages use the
same Finder contract and the remaining edge cases are known.

Candidate generated sections:

- head metadata
- breadcrumbs
- hero metadata lines
- product image block
- reference disclaimer
- Marketplace Finder
- related item navigation
- back links

Still reviewed per page:

- hero copy
- overview card copy
- official source notes
- product details

### Campaign Detail Product Grid Beyond The Current Set

Later target.

The campaign product grid can eventually be generated from `Campaign.itemIds`
and `Item` records across later campaign types.

Wait until:

- parent card curated marketplace-link rules are stable.
- at least one more campaign type confirms the model outside ROUND1, Lawson,
  and COCOS.

### Sitemap Generation

Later target.

The validation already detects missing sitemap entries. Generation is useful,
but should follow page generation or it may hide routing mistakes.

### Full Static Site Generation

Do not start yet.

The site should move toward generation gradually. Full generation is only worth
starting after these are stable:

- item page shape
- campaign page item cards
- Finder data contract
- source records
- related navigation
- at least one more campaign type such as ROUND1

## Do Not Commonize

These should never become blind reusable output.

- unverified facts
- official-source interpretation
- campaign-specific caveats
- rights or endorsement implications
- marketplace availability, price, stock, seller quality, or authenticity
- affiliate disclosure decisions without real affiliate URLs

Validation may enforce rules around these areas, but generation must not invent
or smooth over them.

## Practical Roadmap

1. Done: finish Marketplace Finder rollout for Lawson/COCOS.
2. Done: keep the focused Marketplace Finder renderer/checker in sync with
   Finder-enabled item pages.
3. Done: keep related item navigation renderer/checker in sync with
   published item pages.
4. Done: add ROUND1 data-backed campaign pilot to test another campaign type.
5. Done: add the first ROUND1 item page pilot for the crane-prize route.
6. Done: add the second ROUND1 item page pilot for the retail-sale route and
   clean up empty parent-card `market-links` behavior.
7. Done: add campaign product-grid componentization v0 for ROUND1.
8. Done: extend campaign product-grid componentization to Lawson and COCOS.
9. Done: add three more ROUND1 item pages for trading goods and capsule-toy
   routes, using the established parent grid and item-page contracts.
10. Current: review the expanded ROUND1 item-page set for scaffold patterns
   that are stable enough to generate next.
11. Revisit item-page scaffold generation.
12. Revisit campaign-grid generation beyond the current supported set.

This keeps the project efficient without locking the site into a premature
generator.
