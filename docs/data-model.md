# CollabVaultX Archive Data Model

This document defines the target content model for CollabVaultX archive entries.
The current site is still static HTML, but new pages should map cleanly to these
objects so the archive can later move to JSON or generated pages without losing
source discipline.

## Principles

- Official Japanese work, campaign, and item names stay intact.
- English display fields explain the entry without replacing official names.
- Official sources and marketplace reference searches are separate concepts.
- Every published campaign has a `checkedAt` date and enough source metadata to
  explain what was verified.
- Optional fields should stay empty until confirmed; do not invent counts,
  dates, store rules, prices, or availability.

## Work

A `Work` is the parent intellectual property or title.

Required fields:

- `id`: stable lowercase slug, such as `umamusume`.
- `officialNameJa`: official Japanese title.
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
- `sources`: at least one official `Source`.
- `items`: confirmed item groups.

Optional fields:

- `partnerNames`: stores, venues, brands, or collaborators.
- `categories`: broad stable categories such as `goods`, `clear-file`, `card`,
  `figure`, and `prize`.
- `searchKeywords`: Japanese, English, partner aliases, and major item words.
- `heroAssetId`: hero image asset.
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
- `descriptionJa`: source-backed item description.
- `acquisitionMethodJa`: how it was originally obtained when confirmed.

Optional fields:

- `displayNameEn`: English display name.
- `lineupLabelJa`: confirmed lineup text, such as counts or grouped item names.
- `priceLabel`: confirmed original price or lottery price.
- `availabilityLabel`: confirmed store, venue, period, or limited-stock note.
- `assetIds`: item images.
- `marketplaceSearches`: secondary-market reference searches.
- `confidence`: `official`, `source-backed`, or `needs-verification`.

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

- `platform`: `eBay`, `Mercari`, `Suruga-ya`, or another visible label.
- `url`: search URL.
- `queryLabel`: readable search terms.

Optional fields:

- `region`: market or language expectation.
- `notes`: known ambiguity or keyword limitation.

Marketplace searches must be accompanied by UI copy that availability, price,
and authenticity are not verified by CollabVaultX.

## Lawson Cinderella Gray Example

```json
{
  "work": {
    "id": "umamusume",
    "officialNameJa": "ウマ娘 シンデレラグレイ",
    "displayNameEn": "Uma Musume Cinderella Gray",
    "slug": "umamusume",
    "status": "published"
  },
  "campaign": {
    "id": "lawson-cinderellagray-campaign-202511",
    "workId": "umamusume",
    "officialTitleJa": "アニメ『ウマ娘 シンデレラグレイ』× ローソン",
    "displayTitleEn": "Lawson Cinderella Gray campaign",
    "slug": "lawson-cinderellagray-campaign-202511",
    "status": "published",
    "periodLabel": "2025 Nov-Dec",
    "checkedAt": "2026-06-29",
    "partnerNames": ["ローソン", "HMV", "@Loppi"],
    "categories": ["clear-file", "goods", "prize"],
    "searchKeywords": [
      "Uma Musume Cinderella Gray Lawson",
      "ウマ娘 シンデレラグレイ ローソン",
      "Loppi HMV"
    ],
    "sources": ["lawson-campaign-main", "lawson-loppi-hmv-goods"],
    "items": [
      "lawson-clear-files",
      "lawson-loppi-hmv-reservation-goods",
      "lawson-entame-kuji"
    ]
  },
  "item": {
    "id": "lawson-loppi-hmv-reservation-goods",
    "campaignId": "lawson-cinderellagray-campaign-202511",
    "officialNameJa": "@Loppi・HMV限定予約販売グッズ",
    "displayNameEn": "Loppi/HMV reservation goods",
    "category": "goods",
    "descriptionJa": "@Loppi・HMV&BOOKS online限定の予約販売グッズ。",
    "lineupLabelJa": "ぬいぐるみ全3種 / B2タペストリー全6種 / アクリルジオラマ / 缶バッジ全6種 / フェイスタオル全2種 / アクリルスタンド全6種",
    "acquisitionMethodJa": "@Loppi・HMV&BOOKS online限定の予約販売",
    "assetIds": ["lawson-loppi-hmv-main"],
    "marketplaceSearches": [
      {
        "platform": "eBay",
        "queryLabel": "Uma Musume Cinderella Gray Lawson Loppi HMV goods"
      },
      {
        "platform": "Mercari",
        "queryLabel": "ウマ娘 シンデレラグレイ ローソン Loppi HMV グッズ"
      }
    ],
    "confidence": "official"
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
