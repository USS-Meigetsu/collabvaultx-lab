# CollabVaultX Archive Data Model

This document defines the target content model for CollabVaultX archive entries.
The current site is still static HTML, but new pages should map cleanly to these
objects so the archive can later move to JSON or generated pages without losing
source discipline.

## Principles

- Official Japanese work, campaign, and item names stay intact.
- English display fields explain the entry without replacing official names.
- Official sources and marketplace reference searches are separate concepts.
- `Work` represents the parent public route. Subtitles, anime seasons, and
  focused campaign titles belong on `Campaign`.
- Every published campaign has a `checkedAt` date and enough source metadata to
  explain what was verified.
- Optional fields should stay empty until confirmed; do not invent counts,
  dates, store rules, prices, or availability.

## Work

A `Work` is the parent intellectual property or title.

Required fields:

- `id`: stable lowercase slug, such as `umamusume`.
- `officialNameJa`: official Japanese parent title for the route.
- `displayNameEn`: English display name used for navigation and summaries.
- `slug`: public URL segment under `works/`.
- `status`: `published`, `draft`, or `backlog`.

Optional fields:

- `aliases`: search aliases, spelling variants, and common abbreviations.
- `heroAssetId`: primary visual asset.
- `summaryEn`: short English archive summary.

## Campaign

A `Campaign` is one collaboration, popup, sale campaign, lottery, restaurant
campaign, or venue campaign under a `Work`.

Required fields:

- `id`: stable campaign slug.
- `workId`: parent `Work.id`.
- `officialTitleJa`: official campaign or event title.
- `displayTitleEn`: concise English display title.
- `slug`: public URL segment under `works/<work>/collabs/`.
- `status`: `published`, `draft`, or `backlog`.
- `periodLabel`: human-readable confirmed period.
- `checkedAt`: ISO date when the sources were checked.
- `sourceIds`: IDs for official or partner-official `Source` records.
- `itemIds`: IDs for confirmed `Item` records.

Optional fields:

- `relatedTitleJa`: focused title, season, or spin-off name used by this
  campaign.
- `relatedTitleEn`: English display name for `relatedTitleJa`.
- `partnerNames`: stores, venues, brands, or collaborators.
- `categories`: broad stable categories such as `goods`, `clear-file`, `card`,
  `figure`, `food`, and `prize`.
- `searchKeywords`: Japanese, English, partner aliases, and major item words.
- `heroAssetId`: hero image asset.
- `startDate`: ISO start date when confirmed.
- `endDate`: ISO end date when a single campaign-level end date is confirmed.
  Use this for the main campaign/storefront period, not later item-specific
  redemption, application, or delivery deadlines.
- `endCondition`: text or enum-style value such as `while-supplies-last` or
  `varies-by-item`.
- `cardMeta`: display metadata for archive list cards: `period`, `source`, and
  `items`.
- `marketNoteRequired`: true when any item has marketplace reference searches.
- `summaryJa`: short Japanese archive description.
- `summaryEn`: short English archive description.
- `notes`: source caveats, missing official details, or verification limits.

## Item

An `Item` is a recordable good, bonus, menu benefit, lottery prize group, or
reservation goods group.

Required fields:

- `id`: stable item slug inside the campaign.
- `campaignId`: parent `Campaign.id`.
- `officialNameJa`: official or source-faithful item name.
- `category`: broad item category.
- `recordType`: `single`, `group`, `set`, or `lottery-prize-group`.
- `distributionType`: `purchase-bonus`, `retail-sale`, `food-sale`, `lottery`,
  `crane-prize`, `reservation-sale`, or `facility-bonus`.
- `sourceIds`: source IDs that verify this item. Marketplace references do not
  satisfy this requirement.
- `confidence`: `official`, `source-backed`, or `needs-verification`.
- `descriptionJa`: source-backed item description.
- `acquisitionMethodJa`: how it was originally obtained when confirmed.

Future note: official social follow-and-repost prizes currently use
`distributionType: "lottery"` so published records stay within the validation
enum. If more social-campaign prize records are added, consider introducing a
dedicated value such as `social-campaign-prize` and migrating those items
separately from receipt-code or store lottery records.

Optional fields:

- `displayNameEn`: English display name.
- `summaryEn`: short English archive summary for item cards or item pages.
- `page`: public item-page metadata. A published item page uses:
  - `status`: `published`, `draft`, or `backlog`.
  - `slug`: page slug under the campaign's `items/` directory.
  - `path`: public repo-relative directory path ending in `/`.
    Published item pages must stay under the parent campaign route:
    `works/<workId>/collabs/<campaignSlug>/items/<slug>/`.
- `lineupLabelJa`: confirmed lineup text, such as counts or grouped item names.
- `priceLabel`: confirmed original price or lottery price.
- `availabilityLabel`: confirmed store, venue, period, or limited-stock note.
- `startDate`: ISO date when this item, bonus, lottery, or application window
  started.
- `endDate`: ISO date when this item-specific sale, distribution, application,
  or lottery window ended. This may be later or earlier than `Campaign.endDate`.
- `endCondition`: text or enum-style value such as `while-supplies-last`,
  `may-close-early`, or `varies-by-store`.
- `assetIds`: item images.
- `marketplaceSearches`: secondary-market reference searches.

## Source

A `Source` records where a fact came from.

Required fields:

- `id`: stable source slug.
- `type`: `official`, `partner-official`, `marketplace-reference`, or
  `archive-reference`.
- `url`: source URL.
- `label`: human-readable source label.
- `checkedAt`: ISO date.

Optional fields:

- `scope`: facts covered by this source.
- `notes`: caveats, disappeared pages, or partial coverage.
- `language`: source language when useful.

Official source links should be shown in detail-page reference areas.
Marketplace reference links should remain visually and semantically separate.

## Asset

An `Asset` is a local public image used by the site.

Required fields:

- `id`: stable asset slug.
- `path`: repo-relative public path under `assets/images/`.
- `altJa`: descriptive Japanese alt text.
- `sourceId`: source used to confirm or obtain the visual.

Optional fields:

- `role`: `hero`, `card`, `product`, or `reference`.
- `altEn`: English alt text.
- `credit`: copyright or official credit text when needed.
- `loading`: `eager` for hero images, `lazy` for product-list images.
- `decoding`: usually `async` for product-list images.

Do not store local capture screenshots, PDFs, browser profiles, or temp visual
diff artifacts as public assets.

## MarketplaceSearch

A `MarketplaceSearch` is a reference search, not an official source or purchase
recommendation.

Required fields:

- `id`: stable lowercase slug unique within the parent item, such as
  `ebay-all-results` or `mercari-complete-set`.
- `platform`: stable platform ID. Current allowed values are `ebay`,
  `amazon-jp`, `amazon-us`, `mercari`, `suruga-ya`, `yahoo-fleamarket`, and
  `rakuma`.
- `labelJa`: Japanese link label for the visible UI.
- `labelEn`: English link label for English-first summaries and future
  generated UI.
- `query`: the search phrase represented by the URL.
- `url`: search URL.
- `intent`: search intent. Current allowed values are `all-results`,
  `single-item`, `complete-set`, `character-specific`, `unopened`, and
  `price-check`.
- `isAffiliate`: boolean. Default should be false until a real affiliate URL is
  present.
- `rel`: expected outbound-link relationship tokens.
- `disclosureRequired`: boolean.

Optional fields:

- `region`: market or language expectation.
- `affiliateUrl`: commission-bearing URL. Use only when `isAffiliate` is true.
- `queryLabel`: legacy readable search terms retained during the static HTML
  migration.
- `notes`: known ambiguity or keyword limitation.

Marketplace searches must be accompanied by UI copy that availability, price,
and authenticity are not verified by CollabVaultX.

Non-affiliate marketplace links use `rel="nofollow noopener noreferrer"`.
Affiliate marketplace links use `rel="sponsored noopener noreferrer"` and must
include visible disclosure. See `docs/affiliate-link-policy.md`.

## Published record requirements

Published records have stricter requirements than draft or backlog records.

Published `Work` records require:

- `summaryEn`
- `aliases`

Published `Campaign` records require:

- `summaryEn`
- `searchKeywords`
- `partnerNames`
- `categories`
- `sourceIds`
- `itemIds`
- `periodLabel`
- `checkedAt`
- `heroAssetId`
- `cardMeta.period`
- `cardMeta.source`
- `cardMeta.items`

Published `Item` records require:

- `sourceIds`
- `confidence`
- `recordType`
- `distributionType`
- `displayNameEn`
- `assetIds`, or a documented reason why no image is used

Published item pages additionally require:

- `page.status`
- `page.slug`
- `page.path`
- `summaryEn`
- a matching HTML page, canonical URL, sitemap URL, official source link,
  marketplace reference links when present, and product image metadata

Published `Source` records require:

- `type`
- `url`
- `label`
- `checkedAt`

Published `Asset` records require:

- an existing repo-relative `path`
- `altJa`
- `sourceId`

Published `MarketplaceSearch` records require:

- `id`
- `platform`
- `labelJa`
- `labelEn`
- `query`
- `queryLabel`
- `url`
- `intent`
- `isAffiliate`
- `rel`
- `disclosureRequired`

## Lawson Cinderella Gray Example

```json
{
  "work": {
    "id": "umamusume",
    "officialNameJa": "ウマ娘 プリティーダービー",
    "displayNameEn": "Uma Musume Pretty Derby",
    "slug": "umamusume",
    "status": "published",
    "aliases": ["Uma Musume", "ウマ娘"],
    "summaryEn": "Archive of Uma Musume collaboration goods and campaigns."
  },
  "campaign": {
    "id": "lawson-cinderellagray-campaign-202511",
    "workId": "umamusume",
    "officialTitleJa": "アニメ『ウマ娘 シンデレラグレイ』× ローソン",
    "displayTitleEn": "Lawson Cinderella Gray campaign",
    "relatedTitleJa": "ウマ娘 シンデレラグレイ",
    "relatedTitleEn": "Uma Musume Cinderella Gray",
    "slug": "lawson-cinderellagray-campaign-202511",
    "status": "published",
    "periodLabel": "2025 Nov-Dec",
    "startDate": "2025-11-25",
    "endCondition": "varies-by-item",
    "checkedAt": "2026-06-29",
    "partnerNames": ["ローソン", "HMV", "@Loppi"],
    "categories": ["card", "clear-file", "food", "figure", "goods", "prize"],
    "heroAssetId": "lawson-cinderellagray-hero",
    "cardMeta": {
      "period": "2025 Nov-Dec",
      "source": "Checked 2026-06-29",
      "items": "Clear files / food / goods / lottery"
    },
    "summaryEn": "Lawson campaign archive covering clear-file bonuses, original food, store goods, HMV/Loppi reservation goods, and entertainment lottery items.",
    "searchKeywords": [
      "Uma Musume Cinderella Gray Lawson",
      "ウマ娘 シンデレラグレイ ローソン",
      "Loppi HMV"
    ],
    "sourceIds": [
      "lawson-campaign-main",
      "lawson-clear-file",
      "lawson-food",
      "lawson-goods",
      "lawson-loppi-hmv-goods",
      "kujist-entame-kuji"
    ],
    "itemIds": [
      "lawson-clear-files",
      "lawson-galbo-series",
      "lawson-glass-peach-jelly",
      "lawson-acrylic-stand",
      "lawson-loppi-hmv-reservation-goods",
      "lawson-entame-kuji"
    ],
    "marketNoteRequired": true
  },
  "item": {
    "id": "lawson-loppi-hmv-reservation-goods",
    "campaignId": "lawson-cinderellagray-campaign-202511",
    "officialNameJa": "@Loppi・HMV限定予約販売グッズ",
    "displayNameEn": "Loppi/HMV reservation goods",
    "summaryEn": "Loppi and HMV reservation goods group for the Lawson x Uma Musume Cinderella Gray campaign.",
    "category": "goods",
    "recordType": "group",
    "distributionType": "reservation-sale",
    "sourceIds": ["lawson-loppi-hmv-goods"],
    "confidence": "official",
    "descriptionJa": "@Loppi・HMV&BOOKS online限定の予約販売グッズ。",
    "lineupLabelJa": "ぬいぐるみ全3種 / B2タペストリー全6種 / アクリルジオラマ / 缶バッジ全6種 / フェイスタオル全2種 / アクリルスタンド全6種",
    "acquisitionMethodJa": "@Loppi・HMV&BOOKS online限定の予約販売",
    "assetIds": ["lawson-loppi-hmv-main"],
    "marketplaceSearches": [
      {
        "platform": "eBay",
        "queryLabel": "Uma Musume Cinderella Gray Lawson Loppi HMV goods",
        "url": "https://www.ebay.com/sch/i.html?_nkw=Uma+Musume+Cinderella+Gray+Lawson+Loppi+HMV+goods"
      },
      {
        "platform": "Mercari",
        "queryLabel": "ウマ娘 シンデレラグレイ ローソン Loppi HMV グッズ",
        "url": "https://jp.mercari.com/search?keyword=ウマ娘%20シンデレラグレイ%20ローソン%20Loppi%20HMV%20グッズ"
      }
    ]
  },
  "sources": [
    {
      "id": "lawson-campaign-main",
      "type": "official",
      "url": "https://www.lawson.co.jp/lab/campaign/anime_cinderellagray/",
      "label": "ローソン公式キャンペーンページ",
      "checkedAt": "2026-06-29",
      "scope": "campaign overview, clear files, food, goods, and campaign rules"
    },
    {
      "id": "lawson-loppi-hmv-goods",
      "type": "official",
      "url": "https://www.lawson.co.jp/campaign/lop_anime_cinderellagray_2025/",
      "label": "@Loppi・HMV&BOOKS online限定グッズページ",
      "checkedAt": "2026-06-29",
      "scope": "reservation goods lineup"
    }
  ],
  "asset": {
    "id": "lawson-loppi-hmv-main",
    "path": "assets/images/works/umamusume/collabs/lawson-cinderellagray-campaign-202511/item-loppi-hmv-main.jpg",
    "role": "product",
    "altJa": "@Loppi・HMV限定予約販売グッズ代表画像",
    "sourceId": "lawson-loppi-hmv-goods",
    "loading": "lazy",
    "decoding": "async"
  }
}
```

## Migration Notes

- Keep current HTML as the source of truth until generated data exists.
- When JSON generation starts, first create data that reproduces the existing
  four published Uma Musume pages without visual or metadata regressions.
- Do not add a backend or frontend framework until static generation needs one.
- CI should continue checking source metadata, English summaries, marketplace
  notes, and product image loading behavior during any migration.
