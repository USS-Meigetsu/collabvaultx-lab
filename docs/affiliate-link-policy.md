# Marketplace and Affiliate Link Policy

CollabVaultX uses marketplace links as reference searches. They are not official
sources, purchase recommendations, stock confirmations, price claims, or
authenticity checks.

## Link Types

- Official source links point to rights holders, campaign operators, stores, or
  partner-official pages that verify archive facts.
- Marketplace reference links point to search-result pages on marketplaces such
  as eBay, Amazon, Mercari, Suruga-ya, or Yahoo! Fleamarket.
- Affiliate links may earn commission and must be treated as sponsored links.

Official source links and marketplace links must stay visually and semantically
separate on detail pages.

## Current Default

Marketplace links are non-affiliate reference searches unless their data record
explicitly says otherwise.

Non-affiliate marketplace links use:

```html
rel="nofollow noopener noreferrer"
```

They must be accompanied by visible copy explaining that availability, price,
and authenticity are not verified by CollabVaultX.

## Future Affiliate Links

When a marketplace URL becomes an affiliate URL:

- `isAffiliate` must be `true`.
- `affiliateUrl` must be present.
- `disclosureRequired` must be `true`.
- The page must include a visible affiliate disclosure near the links.
- The link must use:

```html
rel="sponsored noopener noreferrer"
```

Do not mark a link as affiliate, sponsored, or commission-bearing until a real
affiliate URL and visible disclosure are both in place.

## Source Discipline

Marketplace links never verify archive facts. Campaign periods, prices,
lineups, item names, distribution rules, and official availability notes must be
backed by official or partner-official sources.
