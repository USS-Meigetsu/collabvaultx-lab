# Sanrio Split Design

This note defines how the Sanrio Characters popup shop should enter the shared
CollabVaultX data model. It started as a design and source-inventory
checkpoint, then moved into a staged rollout: first the parent product grid,
then a first item-page pilot, a two-page trading/acrylic pair pilot, and a
four-page high-value item-page batch. Do not enable affiliate links, live
marketplace listing fetches, or broad Sanrio item-page generation until each
step is reviewed.

## Current Route

- Public route:
  `works/umamusume/collabs/sanrio-characters-popup-shop-202512/`
- Current source of truth: JSON-backed parent product grid plus the reviewed
  hand-written item pages under that route.
- Data status: Sanrio campaign, source, asset, and item JSON files exist, and
  the campaign product grid is data-backed by
  `scripts/render-campaign-product-grid.mjs`.
- Visible units: 15 goods cards plus 1 purchase-bonus postcard card.
- Local assets: 23 images under
  `assets/images/works/umamusume/collabs/sanrio-characters-popup-shop-202512/`.
- Official or partner-official source:
  `https://animaru.jp/static/special/anmr/umamusume/2026/sanriocharacters/index.html`
  as `アニまるっ！公式特設ページ`, checked on `2026-06-29`.

## Existing Public Facts

- Campaign: `ウマ娘 シンデレラグレイ × サンリオキャラクターズ コラボPOPUPSHOP`.
- WEB advance sale: `2025-12-24` to `2026-01-12`.
- Tokyo venue: `2026-02-13` to `2026-02-26`.
- Osaka venue: `2026-02-13` to `2026-02-23`.
- WEB after-sale: `2026-03-13` to `2026-03-31`.
- Purchase bonus: original postcards, 1 random card per 2,000 yen tax-in
  related purchase, up to 6 per transaction, 6 designs, no complete set.
- Plush mascot: venue advance sale, not handled in the WEB advance sale.

## Split Principles

- Use product-group records, not separate records for every character variant.
- Character variants stay inside the product group as lineup or variant detail.
- Random or trading goods should use `recordType: "group"` so complete-set and
  character-specific searches can be added later without multiplying routes.
- Single-design goods can stay as parent-page product cards at first. Add item
  pages only when the acquisition rules, search behavior, or user value justify
  the extra route.
- Purchase bonuses deserve their own records when the acquisition rule differs
  from normal retail goods.
- Distribution route differences matter. The plush mascot should not be merged
  into ordinary WEB advance sale goods because the current page says it was a
  venue advance sale and not handled in WEB advance sale.
- Add Sanrio to shared renderers only for reviewed blocks. The parent
  product-grid renderer and reviewed item-page shell pilots are supported;
  broad Sanrio item-page generation still waits.

## Proposed Records

| Visible unit | Recommended item id | Page slug | Category | Record type | Distribution | Initial route | Variant handling | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| トレーディングホログラム缶バッジ | `sanrio-trading-hologram-can-badge` | `trading-hologram-can-badge` | `goods` | `group` | `retail-sale` | Item page and Finder candidate | 6 random designs inside the group | Random trading item with useful complete-set and character searches. |
| トレーディングアクリルカード | `sanrio-trading-acrylic-card` | `trading-acrylic-card` | `card` | `group` | `retail-sale` | Item page candidate | 6 random designs inside the group | Card-shaped trading good, likely searched like cards and sets. |
| トレーディングパーツ付きアクリルキーホルダー | `sanrio-trading-parts-acrylic-keyholder` | `trading-parts-acrylic-keyholder` | `goods` | `group` | `retail-sale` | Item page and Finder candidate | 6 random designs inside the group | Long official name and random nature benefit from a focused route. |
| アクリルスタンド | `sanrio-acrylic-stand` | `acrylic-stand` | `figure` | `group` | `retail-sale` | Item page and Finder candidate | 6 character variants inside the group | Acrylic stand searches are high-value and character-specific. |
| BIGアクリルスタンド | `sanrio-big-acrylic-stand` | `big-acrylic-stand` | `figure` | `group` | `retail-sale` | Item page and Finder candidate | 6 character variants inside the group | Distinct size and market wording from the standard acrylic stand. |
| ダイカットスマホステッカー | `sanrio-die-cut-smartphone-sticker` | `die-cut-smartphone-sticker` | `goods` | `group` | `retail-sale` | Parent card first | 6 character variants inside the group | Suitable for data capture, but an item page can wait. |
| クリアファイル | `sanrio-clear-file` | `clear-file` | `clear-file` | `group` | `retail-sale` | Parent card first | 6 character variants inside the group | Existing category exists, but page value is lower than stands or random goods. |
| プレミアムカードホルダー | `sanrio-premium-card-holder` | `premium-card-holder` | `goods` | `single` | `retail-sale` | Parent card first | Single design | One design and ordinary sale route do not need a page immediately. |
| トレーディングおなまえアクリルプレートバッジ | `sanrio-trading-name-acrylic-plate-badge` | `trading-name-acrylic-plate-badge` | `goods` | `group` | `retail-sale` | Item page candidate | 6 random designs inside the group | Random item with a long search phrase. |
| マグカップ | `sanrio-mug` | `mug` | `goods` | `single` | `retail-sale` | Parent card first | Single design | Keep simple until marketplace behavior proves a route is useful. |
| フェイスタオル | `sanrio-face-towel` | `face-towel` | `goods` | `single` | `retail-sale` | Parent card first | Single design | Keep simple until marketplace behavior proves a route is useful. |
| アクリルアートボード | `sanrio-acrylic-art-board` | `acrylic-art-board` | `figure` | `single` | `retail-sale` | Parent card first | Single design | Display acrylic item, but no immediate route requirement. |
| キャンバスボード | `sanrio-canvas-board` | `canvas-board` | `goods` | `group` | `retail-sale` | Parent card first | 6 character variants inside the group | Variant group belongs in data, page can wait. |
| Tシャツ | `sanrio-t-shirt` | `t-shirt` | `goods` | `group` | `retail-sale` | Parent card first | 6 designs, L and XL sizes as variants | Size variants should not create separate item records. |
| ぬいぐるみマスコット | `sanrio-plush-mascot` | `plush-mascot` | `goods` | `group` | `retail-sale` | Item page and Finder candidate | 6 character variants inside the group | Acquisition route differs from the WEB advance sale, so a focused page is useful. |
| 購入特典オリジナルポストカード | `sanrio-original-postcards` | `original-postcards` | `card` | `group` | `purchase-bonus` | Item page and Finder candidate | 6 random postcard designs inside the group | Bonus rules differ from retail goods and need their own source-backed explanation. |

## Source And Asset Plan

Recommended source record:

```json
{
  "id": "sanrio-animaru-special-page",
  "type": "partner-official",
  "url": "https://animaru.jp/static/special/anmr/umamusume/2026/sanriocharacters/index.html",
  "label": "アニまるっ！公式特設ページ",
  "checkedAt": "2026-06-29",
  "scope": "Campaign schedule, goods lineup, purchase bonus, and venue or web sale notes."
}
```

Recommended campaign id:

```text
sanrio-characters-popup-shop-202512
```

Recommended asset-id pattern:

```text
sanrio-hero-main
sanrio-hero-main-sp
sanrio-hologram-can-badge-main
sanrio-trading-acrylic-card-main
sanrio-parts-acrylic-keyholder-main
sanrio-acrylic-stand-main
sanrio-big-acrylic-stand-main
sanrio-smartphone-sticker-main
sanrio-clear-file-main
sanrio-premium-card-holder-main
sanrio-name-acrylic-badge-main
sanrio-mug-main
sanrio-face-towel-main
sanrio-acrylic-art-board-main
sanrio-canvas-board-main
sanrio-t-shirt-main
sanrio-plush-mascot-main
sanrio-postcard-01
sanrio-postcard-02
sanrio-postcard-03
sanrio-postcard-04
sanrio-postcard-05
sanrio-postcard-06
```

## Renderer Status

Sanrio is now supported by `render-campaign-product-grid.mjs` for the campaign
product-grid block, and by `render-item-page-shell.mjs` for the reviewed
published item-page pilots.

- Existing Sanrio product cards now have `data-item-id` attributes that map to
  the draft item records.
- Sanrio product-card facts have been split into `.item-fact-list`, and
  `.market-links` is reserved for marketplace anchors.
- Marketplace links now use `rel="nofollow noopener noreferrer"` while they are
  non-affiliate reference searches.
- The postcard card uses `productGrid.layout: "wide-mini-grid"` plus
  `productGrid.miniGridAssetIds` so the mini-grid remains data-backed without
  splitting postcard designs into separate item records.
- The campaign hero uses a desktop/mobile `<picture>` pair. The current
  item-page shell renderer supports item hero media, but this does not prove the
  Sanrio campaign page itself is ready for generation.
- Seven Sanrio item-page pilots are now published and render Marketplace Finder
  sections. They cover purchase bonus, random/trading goods, acrylic stand
  variants, and the venue-advance plush mascot route. Other Sanrio item pages
  remain intentionally absent or unpublished.

## Current Implementation Checkpoint

Completed in the draft data pilot:

- `data/campaigns/sanrio-characters-popup-shop-202512.json`
- `data/sources/sanrio-characters-popup-shop-202512.json`
- `data/assets/sanrio-characters-popup-shop-202512.json`
- `data/items/sanrio-characters-popup-shop-202512.json`
- Sanrio parent product cards have `data-item-id`.
- Sanrio parent facts and marketplace links use the shared structural pattern.
- The postcard mini-grid remains hand-written and outside `.market-links`.

Completed in the product-grid alignment pilot:

- Sanrio campaign data is `published`.
- Sanrio item records include parent-card marketplace searches for eBay,
  Mercari, and Suruga-ya.
- `sanrio-original-postcards` uses `productGrid.layout: "wide-mini-grid"` and
  six `miniGridAssetIds`.
- The Sanrio campaign product grid is rendered and checked with the shared
  campaign product-grid renderer.
- `sanrio-original-postcards` now has a published `Item.page` and
  `marketplaceFinder.status`.

Completed in the first item-page pilot:

- `works/umamusume/collabs/sanrio-characters-popup-shop-202512/items/original-postcards/index.html`
  publishes the purchase-bonus original postcards route.
- Parent card image and title link to the new item page; no separate detail
  button is used.
- The item page keeps all six postcard images visible without splitting them
  into six records or six pages.
- Marketplace Finder is enabled with non-affiliate reference searches only.
- Related-item navigation and item-page shell fragments are renderer-checked.

Completed in the trading/acrylic pair pilot:

- `works/umamusume/collabs/sanrio-characters-popup-shop-202512/items/trading-hologram-can-badge/index.html`
  publishes the random/trading hologram can badge route.
- `works/umamusume/collabs/sanrio-characters-popup-shop-202512/items/acrylic-stand/index.html`
  publishes the standard acrylic stand route.
- Both parent cards use product image and title links to the new item pages; no
  separate detail buttons are used.
- `sanrio-trading-hologram-can-badge` includes set-oriented reference searches
  for complete-set behavior, while `sanrio-acrylic-stand` stays on broad
  product-group searches until character-specific queries are source-reviewed.
- The original postcard mini-grid remains unchanged and renderer-checked.
- Related-item navigation now covers the three published Sanrio item pages.

Completed in the high-value item-page batch 2:

- `works/umamusume/collabs/sanrio-characters-popup-shop-202512/items/trading-acrylic-card/index.html`
  publishes the trading acrylic card route.
- `works/umamusume/collabs/sanrio-characters-popup-shop-202512/items/trading-parts-acrylic-keyholder/index.html`
  publishes the trading parts acrylic keyholder route.
- `works/umamusume/collabs/sanrio-characters-popup-shop-202512/items/big-acrylic-stand/index.html`
  publishes the BIG acrylic stand route.
- `works/umamusume/collabs/sanrio-characters-popup-shop-202512/items/plush-mascot/index.html`
  publishes the plush mascot route and keeps the venue-advance-sale caveat
  visible.
- Random/trading items include complete-set reference searches where useful;
  acrylic stand and plush pages stay on product-group searches until
  character-specific queries are source-reviewed.
- Related-item navigation now covers the seven published Sanrio item pages.

## Mid-Completion QA

The seven published Sanrio item pages are enough to prove the major item-page
patterns without forcing every remaining product into a route:

- Purchase bonus: `sanrio-original-postcards`
- Random/trading goods: `sanrio-trading-hologram-can-badge`,
  `sanrio-trading-acrylic-card`, and
  `sanrio-trading-parts-acrylic-keyholder`
- Acrylic stand goods: `sanrio-acrylic-stand` and
  `sanrio-big-acrylic-stand`
- Venue-advance route caveat: `sanrio-plush-mascot`

QA decision:

- Keep the seven published pages as the current Sanrio item-page set.
- Do not add character-level item records.
- Do not add affiliate links or live marketplace listings.
- Keep remaining routes unpublished until their page value is higher than the
  parent-card maintenance cost.
- Watch related navigation length. Seven entries are still acceptable; if the
  Sanrio set grows beyond ten published item pages, revisit compact related-nav
  rendering before expanding further.

## Remaining Item Decision Table

| Item id | Decision | Finder value | Reason / risk |
| --- | --- | --- | --- |
| `sanrio-die-cut-smartphone-sticker` | Keep parent-card only for now | Low to medium | Six variants, but the parent card already carries the main fact. Page value is lower than trading or display goods unless marketplace demand appears. |
| `sanrio-clear-file` | Publish in next focused batch | Medium | Clear-file is a stable archive category and a common marketplace term. A page is useful without adding new model complexity. |
| `sanrio-premium-card-holder` | Keep parent-card only | Low | Single design and ordinary retail route. Parent-card treatment is enough until marketplace behavior proves otherwise. |
| `sanrio-trading-name-acrylic-plate-badge` | Publish in next focused batch | High | Random/trading item with a long official name. A page can preserve official wording, complete-set search terms, and source-backed naming. |
| `sanrio-mug` | Keep parent-card only | Low | Single design, ordinary retail route, and no special acquisition rule. |
| `sanrio-face-towel` | Keep parent-card only | Low | Single design, ordinary retail route, and low page-specific complexity. |
| `sanrio-acrylic-art-board` | Defer | Medium | Display acrylic item, but single design. Revisit if acrylic display goods become a dedicated page group. |
| `sanrio-canvas-board` | Publish in next focused batch | Medium | Six variants and display-item search behavior make a focused route useful, but it can stay grouped as one item page. |
| `sanrio-t-shirt` | Defer | Medium | Six designs plus L/XL size variants. Useful later if apparel-size variant handling needs a tested page pattern. |

## Recommended Next Implementation

1. Pause further hand-made Sanrio item-page expansion.
2. Keep the seven published Sanrio pages as a large-product-set reference while
   the Research Package pipeline is defined.
3. Do not mark any additional `marketplaceFinder.status` as `published` until a
   validated package and generator decide that the matching item page should be
   generated.
4. Revisit the remaining Sanrio items after the package workflow can express
   `generate`, `parent-card-only`, `defer`, and `never` decisions cleanly.

This keeps Sanrio useful as a product-set test without letting it pull the site
back into premature manual page generation.
