#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractCampaignProductGridSection,
  normalizeCampaignProductGridHtml,
  renderCampaignProductGrid,
  SUPPORTED_CAMPAIGN_IDS,
} from "./render-campaign-product-grid.mjs";
import {
  marketplaceFinderGroupKeys,
  normalizeMarketplaceFinderHtml,
  renderMarketplaceFinder,
} from "./render-marketplace-finder.mjs";
import {
  extractRelatedItemsSection,
  normalizeRelatedItemsHtml,
  relatedItemsForCampaign,
  renderRelatedItems,
  validateRelatedItemsStructure,
} from "./render-related-items.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.COLLABVAULTX_ROOT_DIR
  ? path.resolve(process.env.COLLABVAULTX_ROOT_DIR)
  : path.resolve(__dirname, "..");

const errors = [];

function fail(message) {
  errors.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/^\uFEFF/, "");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function readCollection(relativeDir) {
  const fullDir = path.join(rootDir, "data", relativeDir);
  return fs
    .readdirSync(fullDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => {
      const parsed = readJson(path.posix.join("data", relativeDir, name));
      return Array.isArray(parsed) ? parsed : [parsed];
    });
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textContent(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function getAttribute(openingTag, name) {
  const pattern = new RegExp(`${name}=(["'])(.*?)\\1`);
  return openingTag.match(pattern)?.[2] ?? "";
}

function getOpeningTags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "g"))].map((match) => match[0]);
}

function getCanonicalUrl(html) {
  const tag = getOpeningTags(html, "link").find((openingTag) => getAttribute(openingTag, "rel") === "canonical");
  return tag ? decodeEntities(getAttribute(tag, "href")) : "";
}

function getMetaContent(html, propertyName) {
  const tag = getOpeningTags(html, "meta").find((openingTag) => getAttribute(openingTag, "property") === propertyName);
  return tag ? decodeEntities(getAttribute(tag, "content")) : "";
}

function getNamedMetaContent(html, name) {
  const tag = getOpeningTags(html, "meta").find((openingTag) => getAttribute(openingTag, "name") === name);
  return tag ? decodeEntities(getAttribute(tag, "content")) : "";
}

function extractArticle(html, id) {
  const articlePattern = new RegExp(
    `<article\\b(?=[^>]*\\bid=(["'])${id}\\1)[^>]*>[\\s\\S]*?<\\/article>`,
  );
  const article = html.match(articlePattern)?.[0];
  if (!article) return null;

  const openingTag = article.match(/^<article\b[^>]*>/)?.[0] ?? "";
  return { html: article, openingTag };
}

function extractCampaignCardBySlug(html, slug) {
  const articlePattern = /<article\b[^>]*>[\s\S]*?<\/article>/g;
  for (const match of html.matchAll(articlePattern)) {
    if (match[0].includes(`data-collab-slug="${slug}"`) || match[0].includes(`data-collab-slug='${slug}'`)) {
      const openingTag = match[0].match(/^<article\b[^>]*>/)?.[0] ?? "";
      return { html: match[0], openingTag };
    }
  }
  return null;
}

function extractProductCardByItemId(html, itemId) {
  const articlePattern = /<article\b(?=[^>]*class=["'][^"']*\bproduct-card\b)[^>]*>[\s\S]*?<\/article>/g;
  for (const match of html.matchAll(articlePattern)) {
    const openingTag = match[0].match(/^<article\b[^>]*>/)?.[0] ?? "";
    if (getAttribute(openingTag, "data-item-id") === itemId) {
      return match[0];
    }
  }
  return null;
}

function extractSectionByAriaLabelledby(html, labelledBy) {
  const sectionPattern = new RegExp(
    `<section\\b(?=[^>]*\\baria-labelledby=(["'])${labelledBy}\\1)[^>]*>[\\s\\S]*?<\\/section>`,
  );
  return html.match(sectionPattern)?.[0] ?? null;
}

function extractCardMeta(articleHtml) {
  const meta = {};
  const pairPattern = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
  for (const match of articleHtml.matchAll(pairPattern)) {
    meta[textContent(match[1])] = textContent(match[2]);
  }
  return meta;
}

function extractCollabLinks(articleHtml) {
  return [...articleHtml.matchAll(/<a\b[^>]*data-collab-slug=["'][^"']+["'][^>]*>/g)].map(
    (match) => match[0],
  );
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"));
}

function normalizeKeyword(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pagePathToHtmlPath(pagePath) {
  return pagePath.endsWith("/") ? `${pagePath}index.html` : pagePath;
}

function relativeUrl(fromHtmlPath, targetRepoPath) {
  const fromDir = path.posix.dirname(fromHtmlPath.replace(/\\/g, "/"));
  const target = targetRepoPath.replace(/\\/g, "/");
  const relative = path.posix.relative(fromDir, target);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function primaryAssetForItem(item) {
  return (item.assetIds ?? []).map((id) => assetMap.get(id)).find(Boolean) ?? null;
}

function publicUrlForPath(pagePath) {
  const host = fs.existsSync(path.join(rootDir, "CNAME"))
    ? readText("CNAME").trim()
    : "";
  const normalized = pagePath.replace(/^\/+/, "");
  return host ? `https://${host}/${normalized}` : `/${normalized}`;
}

function assertTextIncludes(pageText, expected, label) {
  if (typeof expected === "string" && expected.trim() !== "" && !pageText.includes(expected)) {
    fail(`${label}: page text is missing "${expected}"`);
  }
}

function assertHtmlIncludes(html, expected, label, field) {
  if (typeof expected === "string" && expected.trim() !== "" && !html.includes(expected)) {
    fail(`${label}: ${field} is missing "${expected}"`);
  }
}

function findAnchorsByHref(html, href) {
  return getOpeningTags(html, "a").filter((tag) => decodeEntities(getAttribute(tag, "href")) === href);
}

function assertAnchorRel(tag, expectedRel, label) {
  const actualTokens = new Set(getAttribute(tag, "rel").toLowerCase().split(/\s+/).filter(Boolean));
  const expectedTokens = String(expectedRel ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  for (const token of expectedTokens) {
    if (!actualTokens.has(token)) {
      fail(`${label}: marketplace link rel must include "${token}"`);
    }
  }
}

function validateMarketplaceAnchors(html, searches, label) {
  for (const search of searches ?? []) {
    const anchors = findAnchorsByHref(html, search.url);
    if (anchors.length === 0) {
      fail(`${label}: marketplace URL for ${search.id ?? search.platform} must be an anchor href`);
      continue;
    }
    for (const anchor of anchors) {
      assertAnchorRel(anchor, search.rel, `${label}: ${search.id ?? search.platform}`);
    }
  }
}

function validateMarketplaceFinder(item, itemHtml, label) {
  if (item.marketplaceFinder?.status !== "published") return;

  const finder = extractSectionByAriaLabelledby(itemHtml, "marketplace-finder-heading");
  if (!finder || !finder.includes(`data-marketplace-finder="${item.id}"`)) {
    fail(`${label}: Marketplace Finder section is missing for this enabled item`);
    return;
  }

  const finderText = textContent(finder);
  if (!finderText.includes("Reference searches only")) {
    fail(`${label}: Marketplace Finder must explain that links are reference searches only`);
  }
  if (!finderText.includes("stock, price, authenticity")) {
    fail(`${label}: Marketplace Finder must avoid implying stock, price, or authenticity verification`);
  }

  const officialSourceUrls = (item.sourceIds ?? [])
    .map((id) => sourceMap.get(id)?.url)
    .filter(Boolean);
  for (const url of officialSourceUrls) {
    if (finder.includes(url)) {
      fail(`${label}: official source URL must not appear inside Marketplace Finder`);
    }
  }

  for (const search of item.marketplaceSearches ?? []) {
    if (!finder.includes(search.url)) {
      fail(`${label}: Marketplace Finder is missing URL for ${search.id}`);
    }
    if (!finder.includes(`data-marketplace-id="${search.id}"`)) {
      fail(`${label}: Marketplace Finder is missing data-marketplace-id="${search.id}"`);
    }
    if (!finderText.includes(search.labelJa) && !finderText.includes(search.labelEn)) {
      fail(`${label}: Marketplace Finder is missing label for ${search.id}`);
    }
  }

  const groupTags = getOpeningTags(finder, "article").filter((tag) =>
    /\bmarketplace-group\b/.test(getAttribute(tag, "class")),
  );
  const actualGroups = groupTags.map((tag) => getAttribute(tag, "data-marketplace-group"));
  const expectedGroups = marketplaceFinderGroupKeys(item.marketplaceSearches ?? []);
  if (actualGroups.join(",") !== expectedGroups.join(",")) {
    fail(`${label}: Marketplace Finder groups must match JSON finderGroup order (${expectedGroups.join(",")})`);
  }
  if (groupTags.some((tag) => getAttribute(tag, "data-marketplace-intent") !== "")) {
    fail(`${label}: Marketplace Finder groups should use data-marketplace-group, not data-marketplace-intent`);
  }

  const renderedFinder = renderMarketplaceFinder(item);
  if (normalizeMarketplaceFinderHtml(finder) !== normalizeMarketplaceFinderHtml(renderedFinder)) {
    fail(`${label}: Marketplace Finder must match scripts/render-marketplace-finder.mjs output`);
  }

  validateMarketplaceAnchors(finder, item.marketplaceSearches, `${label}: Marketplace Finder`);
}

function validateRelatedItemNavigation(item, itemHtml, itemHtmlPath, campaign, publishedItems, label) {
  const section = extractRelatedItemsSection(itemHtml);
  const relatedBlock = section?.html ?? "";
  if (!section || !relatedBlock.includes('id="related-items-heading"')) {
    fail(`${label}: related item navigation is missing related-items-heading`);
    return;
  }

  const relatedItems = relatedItemsForCampaign(campaign, publishedItems);
  const renderedRelatedItems = renderRelatedItems(item, campaign, relatedItems, { indent: section.indent });
  if (normalizeRelatedItemsHtml(relatedBlock) !== normalizeRelatedItemsHtml(renderedRelatedItems)) {
    fail(`${label}: related item navigation must match scripts/render-related-items.mjs output`);
  }

  for (const error of validateRelatedItemsStructure({
    item,
    campaign,
    relatedItems,
    sectionHtml: relatedBlock,
    itemHtmlPath,
    label,
  })) {
    fail(error);
  }
}

const campaigns = readCollection("campaigns");
const items = readCollection("items");
const sources = readCollection("sources");
const assets = readCollection("assets");
const campaignMap = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
const itemMap = new Map(items.map((item) => [item.id, item]));
const sourceMap = new Map(sources.map((source) => [source.id, source]));
const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
const supportedCampaignProductGridIds = new Set(SUPPORTED_CAMPAIGN_IDS);

function validateCampaignCard(campaign) {
  const workIndexPath = `works/${campaign.workId}/index.html`;
  const html = readText(workIndexPath);
  const card = extractCampaignCardBySlug(html, campaign.slug);
  const label = `${workIndexPath}#${campaign.slug}`;

  if (!card) {
    fail(`${label}: published campaign card is missing`);
    return;
  }

  const status = getAttribute(card.openingTag, "data-status");
  const categories = getAttribute(card.openingTag, "data-category")
    .split(/\s+/)
    .filter(Boolean);
  const searchKeywords = getAttribute(card.openingTag, "data-search-keywords");
  const htmlCategorySet = new Set(categories);
  const jsonCategorySet = new Set(campaign.categories ?? []);
  const meta = extractCardMeta(card.html);
  const collabLinks = extractCollabLinks(card.html);

  if (status !== "published") {
    fail(`${label}: data-status must be published`);
  }

  if (searchKeywords.trim() === "") {
    fail(`${label}: data-search-keywords must not be empty`);
  }
  const normalizedHtmlKeywords = normalizeKeyword(searchKeywords);
  for (const keyword of campaign.searchKeywords ?? []) {
    if (!normalizedHtmlKeywords.includes(normalizeKeyword(keyword))) {
      fail(`${label}: data-search-keywords is missing campaign.searchKeywords entry "${keyword}"`);
    }
  }

  for (const category of uniqueSorted(jsonCategorySet)) {
    if (!htmlCategorySet.has(category)) {
      fail(`${label}: data-category is missing JSON category "${category}"`);
    }
  }
  for (const category of uniqueSorted(htmlCategorySet)) {
    if (!jsonCategorySet.has(category)) {
      fail(`${label}: data-category has extra HTML category "${category}" not present in campaign JSON`);
    }
  }

  if (meta.Period !== campaign.cardMeta?.period) {
    fail(`${label}: card Period "${meta.Period}" does not match campaign.cardMeta.period "${campaign.cardMeta?.period}"`);
  }
  if (meta.Source !== campaign.cardMeta?.source) {
    fail(`${label}: card Source "${meta.Source}" does not match campaign.cardMeta.source "${campaign.cardMeta?.source}"`);
  }
  if (meta.Items !== campaign.cardMeta?.items) {
    fail(`${label}: card Items "${meta.Items}" does not match campaign.cardMeta.items "${campaign.cardMeta?.items}"`);
  }

  if (collabLinks.length === 0) {
    fail(`${label}: no a[data-collab-slug] links found`);
  }

  for (const [index, link] of collabLinks.entries()) {
    const href = decodeEntities(getAttribute(link, "href"));
    const dataSlug = getAttribute(link, "data-collab-slug");

    if (dataSlug !== campaign.slug) {
      fail(`${label}: link ${index + 1} data-collab-slug "${dataSlug}" does not match campaign.slug "${campaign.slug}"`);
    }

    if (!href.includes(`/collabs/${campaign.slug}/`) && !href.includes(`./collabs/${campaign.slug}/`)) {
      fail(`${label}: link ${index + 1} href "${href}" does not point to campaign slug "${campaign.slug}"`);
    }
  }
}

function validateCampaignPageMetadata(campaign) {
  const campaignPagePath = `works/${campaign.workId}/collabs/${campaign.slug}/`;
  const campaignHtmlPath = pagePathToHtmlPath(campaignPagePath);
  const campaignHtmlFullPath = path.join(rootDir, campaignHtmlPath);
  const campaignLabel = `campaign page ${campaign.slug}`;

  if (!fs.existsSync(campaignHtmlFullPath)) {
    fail(`${campaignLabel}: ${campaignHtmlPath} is missing`);
    return;
  }

  const campaignHtml = readText(campaignHtmlPath);
  const campaignPublicUrl = publicUrlForPath(campaignPagePath);
  const campaignOgTitle = getMetaContent(campaignHtml, "og:title");
  const campaignOgDescription = getMetaContent(campaignHtml, "og:description");
  const campaignOgImage = getMetaContent(campaignHtml, "og:image");
  const heroAsset = assetMap.get(campaign.heroAssetId);

  if (getCanonicalUrl(campaignHtml) !== campaignPublicUrl) {
    fail(`${campaignLabel}: canonical URL does not match ${campaignPublicUrl}`);
  }
  if (getMetaContent(campaignHtml, "og:url") !== campaignPublicUrl) {
    fail(`${campaignLabel}: og:url does not match ${campaignPublicUrl}`);
  }
  if (!readText("sitemap.xml").includes(`<loc>${campaignPublicUrl}</loc>`)) {
    fail(`${campaignLabel}: sitemap.xml is missing ${campaignPublicUrl}`);
  }
  if (!heroAsset) {
    fail(`${campaignLabel}: heroAssetId "${campaign.heroAssetId}" does not resolve to an asset`);
  } else {
    const expectedOgImage = publicUrlForPath(heroAsset.path);
    if (campaignOgImage !== expectedOgImage) {
      fail(`${campaignLabel}: og:image must match hero asset URL ${expectedOgImage}`);
    }
    if (getMetaContent(campaignHtml, "og:image:alt") !== heroAsset.altJa) {
      fail(`${campaignLabel}: og:image:alt must match hero asset altJa`);
    }
  }
  if (getNamedMetaContent(campaignHtml, "twitter:title") !== campaignOgTitle) {
    fail(`${campaignLabel}: twitter:title must match og:title`);
  }
  if (getNamedMetaContent(campaignHtml, "twitter:description") !== campaignOgDescription) {
    fail(`${campaignLabel}: twitter:description must match og:description`);
  }
  if (getNamedMetaContent(campaignHtml, "twitter:image") !== campaignOgImage) {
    fail(`${campaignLabel}: twitter:image must match og:image`);
  }
}

function validateCampaignDetailItemCards(campaign) {
  const campaignHtmlPath = pagePathToHtmlPath(`works/${campaign.workId}/collabs/${campaign.slug}/`);
  const campaignHtmlFullPath = path.join(rootDir, campaignHtmlPath);
  if (!fs.existsSync(campaignHtmlFullPath)) return;

  const campaignHtml = readText(campaignHtmlPath);
  validateCampaignProductGrid(campaign, campaignHtml);
  const campaignItems = (campaign.itemIds ?? [])
    .map((id) => itemMap.get(id))
    .filter(Boolean);

  for (const item of campaignItems) {
    const label = `campaign page ${campaign.slug} item card ${item.id}`;
    const productCard = extractProductCardByItemId(campaignHtml, item.id);

    if (!productCard) {
      fail(`${label}: missing product-card with data-item-id="${item.id}"`);
      continue;
    }

    const cardText = textContent(productCard);
    assertTextIncludes(cardText, item.officialNameJa, label);
    assertTextIncludes(cardText, item.lineupLabelJa, label);
    assertTextIncludes(cardText, item.acquisitionMethodJa, label);
    assertTextIncludes(cardText, item.priceLabel, label);

    const asset = primaryAssetForItem(item);
    if (!asset) {
      fail(`${label}: assetIds must include at least one known asset`);
    } else {
      const expectedImageSrc = relativeUrl(campaignHtmlPath, asset.path);
      assertHtmlIncludes(productCard, `src="${expectedImageSrc}"`, label, "product image");
      assertHtmlIncludes(productCard, `alt="${asset.altJa}"`, label, "product image alt");
    }

    const marketplaceSearches = item.marketplaceSearches ?? [];
    const marketLinksMatch = productCard.match(
      /<div\b(?=[^>]*class=(["'])[^"']*\bmarket-links\b[^"']*\1)[^>]*>([\s\S]*?)<\/div>/,
    );
    if (!marketLinksMatch) {
      if (marketplaceSearches.length > 0) {
        fail(`${label}: market-links block is missing for an item with marketplaceSearches`);
      }
      continue;
    }

    const marketLinksHtml = marketLinksMatch[2];
    if (/<span\b/i.test(marketLinksHtml)) {
      fail(`${label}: market-links must contain reference links only, not official fact spans`);
    }

    const officialSourceUrls = (item.sourceIds ?? [])
      .map((id) => sourceMap.get(id)?.url)
      .filter(Boolean);
    for (const url of officialSourceUrls) {
      if (marketLinksHtml.includes(url)) {
        fail(`${label}: official source URL must not appear inside market-links`);
      }
    }

    const marketplaceUrlMap = new Map(marketplaceSearches.map((search) => [search.url, search]));
    const marketplaceAnchors = getOpeningTags(marketLinksHtml, "a");
    if (marketplaceSearches.length > 0 && marketplaceAnchors.length === 0) {
      fail(`${label}: market-links block must include at least one marketplace search link`);
    }
    for (const anchor of marketplaceAnchors) {
      const href = decodeEntities(getAttribute(anchor, "href"));
      const matchingSearch = marketplaceUrlMap.get(href);
      if (!matchingSearch) {
        fail(`${label}: market-links href "${href}" is not present in item.marketplaceSearches`);
        continue;
      }
      assertAnchorRel(anchor, matchingSearch.rel, `${label}: ${matchingSearch.id ?? matchingSearch.platform}`);
    }
  }
}

function validateCampaignProductGrid(campaign, campaignHtml) {
  if (!supportedCampaignProductGridIds.has(campaign.id)) return;

  const label = `campaign page ${campaign.slug} product grid`;
  const section = extractCampaignProductGridSection(campaignHtml);
  if (!section) {
    fail(`${label}: product-grid section is missing`);
    return;
  }

  const renderedGrid = renderCampaignProductGrid(campaign, itemMap, assetMap, { indent: section.indent });
  if (normalizeCampaignProductGridHtml(section.html) !== normalizeCampaignProductGridHtml(renderedGrid)) {
    fail(`${label}: product-grid must match scripts/render-campaign-product-grid.mjs output`);
  }
}

for (const campaign of campaigns.filter((candidate) => candidate.status === "published")) {
  validateCampaignCard(campaign);
  validateCampaignPageMetadata(campaign);
  validateCampaignDetailItemCards(campaign);
}

function validatePublishedItemPage(item) {
  const campaign = campaignMap.get(item.campaignId);
  const label = `${campaign?.slug ?? item.campaignId} item page ${item.id}`;
  const itemPage = item.page;

  if (!campaign) {
    fail(`${label}: campaign metadata is missing`);
    return;
  }

  if (!itemPage || itemPage.status !== "published" || !itemPage.slug || !itemPage.path) {
    fail(`${label}: item must have published page metadata`);
    return;
  }

  const itemHtmlPath = pagePathToHtmlPath(itemPage.path);
  const itemHtmlFullPath = path.join(rootDir, itemHtmlPath);
  const itemPublicUrl = publicUrlForPath(itemPage.path);

  if (!fs.existsSync(itemHtmlFullPath)) {
    fail(`${label}: ${itemHtmlPath} is missing`);
    return;
  }

  const itemHtml = readText(itemHtmlPath);
  const itemPageText = textContent(itemHtml);
  const parentHtmlPath = `works/${campaign.workId}/collabs/${campaign.slug}/index.html`;
  const parentHtml = readText(parentHtmlPath);
  const sitemap = readText("sitemap.xml");
  const verifyingSources = item.sourceIds
    .map((id) => sourceMap.get(id))
    .filter((candidate) => candidate?.type === "official" || candidate?.type === "partner-official");
  const primaryAsset = primaryAssetForItem(item);

  if (getCanonicalUrl(itemHtml) !== itemPublicUrl) {
    fail(`${label}: canonical URL does not match ${itemPublicUrl}`);
  }
  if (getMetaContent(itemHtml, "og:url") !== itemPublicUrl) {
    fail(`${label}: og:url does not match ${itemPublicUrl}`);
  }
  const ogTitle = getMetaContent(itemHtml, "og:title");
  const ogDescription = getMetaContent(itemHtml, "og:description");
  const ogImage = getMetaContent(itemHtml, "og:image");
  if (getNamedMetaContent(itemHtml, "twitter:title") !== ogTitle) {
    fail(`${label}: twitter:title must match og:title`);
  }
  if (getNamedMetaContent(itemHtml, "twitter:description") !== ogDescription) {
    fail(`${label}: twitter:description must match og:description`);
  }
  if (getNamedMetaContent(itemHtml, "twitter:image") !== ogImage) {
    fail(`${label}: twitter:image must match og:image`);
  }
  if (!sitemap.includes(`<loc>${itemPublicUrl}</loc>`)) {
    fail(`${label}: sitemap.xml is missing ${itemPublicUrl}`);
  }

  const productCard = extractProductCardByItemId(parentHtml, item.id);
  if (!productCard) {
    fail(`${label}: parent campaign page is missing product card with data-item-id="${item.id}"`);
  } else {
    const expectedParentHref = relativeUrl(parentHtmlPath, itemHtmlPath);
    const alternateParentHref = expectedParentHref.replace(/^\.\//, "");
    const parentHrefMatches = (href) => href === expectedParentHref || href === alternateParentHref;
    const thumbLink = getOpeningTags(productCard, "a").find((tag) =>
      /\bproduct-thumb-link\b/.test(getAttribute(tag, "class")),
    );
    const titleLink = getOpeningTags(productCard, "a").find((tag) =>
      /\bproduct-title-link\b/.test(getAttribute(tag, "class")),
    );

    if (!thumbLink || !parentHrefMatches(decodeEntities(getAttribute(thumbLink, "href")))) {
      fail(`${label}: parent product card image link must point to ${expectedParentHref}`);
    }
    if (!titleLink || !parentHrefMatches(decodeEntities(getAttribute(titleLink, "href")))) {
      fail(`${label}: parent product card title link must point to ${expectedParentHref}`);
    }
    if (/<a\b[^>]*class=(["'])[^"']*\bcard-button\b[^"']*\1[^>]*>[\s\S]*?詳細ページ[\s\S]*?<\/a>/i.test(productCard)) {
      fail(`${label}: parent product card should use image/title links instead of a detail-page card-button`);
    }
  }

  assertTextIncludes(itemPageText, item.officialNameJa, label);
  assertTextIncludes(itemPageText, item.summaryEn, label);
  assertTextIncludes(itemPageText, item.lineupLabelJa, label);
  assertTextIncludes(itemPageText, item.priceLabel, label);
  assertTextIncludes(itemPageText, item.acquisitionMethodJa, label);
  assertTextIncludes(itemPageText, item.availabilityLabel, label);

  if (verifyingSources.length === 0) {
    fail(`${label}: sourceIds must include at least one official or partner-official source`);
  } else {
    for (const source of verifyingSources) {
      if (!itemHtml.includes(source.url)) {
        fail(`${label}: item page is missing official source URL ${source.url}`);
      }
    }
  }

  validateRelatedItemNavigation(item, itemHtml, itemHtmlPath, campaign, publishedItemPageItems, label);

  for (const search of item.marketplaceSearches ?? []) {
    if (!itemHtml.includes(search.url)) {
      fail(`${label}: item page is missing marketplace URL for ${search.platform}`);
    }
  }
  validateMarketplaceAnchors(itemHtml, item.marketplaceSearches, label);
  validateMarketplaceFinder(item, itemHtml, label);

  if (!primaryAsset) {
    fail(`${label}: assetIds must include at least one known asset`);
  } else {
    const expectedOgImage = publicUrlForPath(primaryAsset.path);
    if (ogImage !== expectedOgImage) {
      fail(`${label}: og:image must match primary asset URL ${expectedOgImage}`);
    }

    if (getMetaContent(itemHtml, "og:image:alt") !== primaryAsset.altJa) {
      fail(`${label}: og:image:alt must match primary asset.altJa`);
    }

    const heroImageMatch = itemHtml.match(
      /<picture\b(?=[^>]*class=(["'])[^"']*\bsubpage-hero-collab-media\b[^"']*\1)[\s\S]*?<img\b([^>]*)>/,
    );
    if (!heroImageMatch) {
      fail(`${label}: hero image is missing from subpage-hero-collab-media`);
    } else {
      const heroImage = heroImageMatch[2];
      if (getAttribute(heroImage, "loading") !== "eager") {
        fail(`${label}: hero image must use loading="eager"`);
      }
      if (getAttribute(heroImage, "fetchpriority") !== "high") {
        fail(`${label}: hero image must use fetchpriority="high"`);
      }
      if (getAttribute(heroImage, "decoding") !== "async") {
        fail(`${label}: hero image must use decoding="async"`);
      }
    }

    const productImages = [
      ...itemHtml.matchAll(/<div\b(?=[^>]*class=(["'])[^"']*\bproduct-thumb\b[^"']*\1)[^>]*>\s*<img\b([^>]*)>/g),
    ].map((match) => match[2]);

    const expectedImageSrc = relativeUrl(itemHtmlPath, primaryAsset.path);
    const productImage = productImages.find((attributes) => decodeEntities(getAttribute(attributes, "src")) === expectedImageSrc);

    if (!productImage) {
      fail(`${label}: product image src must match ${expectedImageSrc}`);
    } else {
      if (getAttribute(productImage, "loading") !== "lazy") {
        fail(`${label}: product image must use loading="lazy"`);
      }
      if (getAttribute(productImage, "decoding") !== "async") {
        fail(`${label}: product image must use decoding="async"`);
      }
      if (decodeEntities(getAttribute(productImage, "alt")) !== primaryAsset.altJa) {
        fail(`${label}: product image alt must match asset.altJa`);
      }
    }
  }
}

const publishedItemPageItems = items.filter((item) => item.page?.status === "published");
for (const item of publishedItemPageItems) {
  validatePublishedItemPage(item);
}

if (errors.length > 0) {
  console.error("Data/HTML sync checks failed:");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("Data/HTML sync checks passed: published campaign cards and item pages match pilot JSON.");
