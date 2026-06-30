#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.COLLABVAULTX_ROOT_DIR
  ? path.resolve(process.env.COLLABVAULTX_ROOT_DIR)
  : path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");

const errors = [];
const warnings = [];

const allowedStatuses = new Set(["published", "draft", "backlog"]);
const allowedCategories = new Set([
  "card",
  "clear-file",
  "figure",
  "food",
  "goods",
  "prize",
]);
const allowedSourceTypes = new Set([
  "official",
  "partner-official",
  "marketplace-reference",
  "archive-reference",
]);
const sourceTypesThatCanVerifyFacts = new Set(["official", "partner-official"]);
const allowedRecordTypes = new Set([
  "single",
  "group",
  "set",
  "lottery-prize-group",
]);
const allowedDistributionTypes = new Set([
  "purchase-bonus",
  "retail-sale",
  "food-sale",
  "lottery",
  "crane-prize",
  "reservation-sale",
  "facility-bonus",
]);
const allowedConfidence = new Set([
  "official",
  "source-backed",
  "needs-verification",
]);
const allowedMarketplacePlatforms = new Set([
  "ebay",
  "amazon-jp",
  "amazon-us",
  "mercari",
  "suruga-ya",
  "yahoo-fleamarket",
  "rakuma",
]);
const allowedMarketplaceIntents = new Set([
  "all-results",
  "single-item",
  "complete-set",
  "character-specific",
  "unopened",
  "price-check",
]);
const allowedMarketplaceFinderGroups = new Set([
  "overview",
  "sets",
  "single-item",
  "jp-marketplaces",
  "price-check",
  "other",
]);
const allowedProductGridLayouts = new Set(["wide-mini-grid"]);
const requiredMarketplaceRelTokens = new Set(["noopener", "noreferrer"]);

const unsafeStringPatterns = [
  /AppData/i,
  /[\\/]Temp[\\/]/i,
  /collabvaultx-visual-diffs/i,
  /browser[-_ ]?profile/i,
  /Login Data/i,
  /Local State/i,
  /Web Data/i,
  /Secure Preferences/i,
  /source[-_ ]?capture/i,
];
const mojibakePattern = /繧|縺|蜈|螢|莠|遞|逕|蜒|髯|譁|蠑|鬚/;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    fail(`${path.relative(rootDir, filePath)}: invalid JSON (${error.message})`);
    return null;
  }
}

function readCollection(relativeDir) {
  const fullDir = path.join(dataDir, relativeDir);
  if (!fs.existsSync(fullDir)) {
    fail(`Missing data directory: data/${relativeDir}`);
    return [];
  }

  return fs
    .readdirSync(fullDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => {
      const filePath = path.join(fullDir, name);
      const parsed = readJsonFile(filePath);
      if (parsed === null) return [];
      const records = Array.isArray(parsed) ? parsed : [parsed];
      return records.map((record) => ({
        ...record,
        __file: path.relative(rootDir, filePath),
      }));
    });
}

function requireString(record, field, label) {
  if (typeof record[field] !== "string" || record[field].trim() === "") {
    fail(`${label}: missing required string field "${field}"`);
    return false;
  }
  return true;
}

function requireArray(record, field, label) {
  if (!Array.isArray(record[field]) || record[field].length === 0) {
    fail(`${label}: missing required non-empty array field "${field}"`);
    return false;
  }
  return true;
}

function requireObject(record, field, label) {
  if (
    record[field] === null ||
    typeof record[field] !== "object" ||
    Array.isArray(record[field])
  ) {
    fail(`${label}: missing required object field "${field}"`);
    return false;
  }
  return true;
}

function requireBoolean(record, field, label) {
  if (typeof record[field] !== "boolean") {
    fail(`${label}: missing required boolean field "${field}"`);
    return false;
  }
  return true;
}

function validateId(record, label) {
  if (!requireString(record, "id", label)) return;
  if (!idPattern.test(record.id)) {
    fail(`${label}: id "${record.id}" must be lowercase kebab-case`);
  }
}

function validateStatus(record, label) {
  if (!requireString(record, "status", label)) return;
  if (!allowedStatuses.has(record.status)) {
    fail(`${label}: unsupported status "${record.status}"`);
  }
}

function validateIsoDate(value, label, field) {
  if (value === undefined) return;
  if (typeof value !== "string" || !isoDatePattern.test(value)) {
    fail(`${label}: ${field} must be an ISO date (YYYY-MM-DD)`);
  }
}

function validateUrl(value, label, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label}: missing URL field "${field}"`);
    return;
  }

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      fail(`${label}: ${field} must use http or https`);
    }
  } catch {
    fail(`${label}: invalid URL in "${field}"`);
  }
}

function validateMarketplaceSearch(search, label) {
  validateId(search, label);
  requireString(search, "platform", label);
  requireString(search, "labelJa", label);
  requireString(search, "labelEn", label);
  requireString(search, "query", label);
  requireString(search, "intent", label);
  requireString(search, "rel", label);
  requireBoolean(search, "isAffiliate", label);
  requireBoolean(search, "disclosureRequired", label);
  validateUrl(search.url, label, "url");
  if (search.queryLabel !== undefined) {
    requireString(search, "queryLabel", label);
  }
  if (search.finderGroup !== undefined) {
    requireString(search, "finderGroup", label);
  }

  if (typeof search.platform === "string" && !allowedMarketplacePlatforms.has(search.platform)) {
    fail(`${label}: unsupported marketplace platform "${search.platform}"`);
  }
  if (typeof search.intent === "string" && !allowedMarketplaceIntents.has(search.intent)) {
    fail(`${label}: unsupported marketplace intent "${search.intent}"`);
  }
  if (
    typeof search.finderGroup === "string" &&
    !allowedMarketplaceFinderGroups.has(search.finderGroup)
  ) {
    fail(`${label}: unsupported marketplace finderGroup "${search.finderGroup}"`);
  }

  const relTokens = new Set(String(search.rel ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  for (const token of requiredMarketplaceRelTokens) {
    if (!relTokens.has(token)) {
      fail(`${label}: rel must include "${token}"`);
    }
  }

  if (search.isAffiliate) {
    validateUrl(search.affiliateUrl, label, "affiliateUrl");
    if (!search.disclosureRequired) {
      fail(`${label}: affiliate links must set disclosureRequired=true`);
    }
    if (!relTokens.has("sponsored")) {
      fail(`${label}: affiliate links must use rel including "sponsored"`);
    }
  } else {
    if (search.affiliateUrl !== undefined && String(search.affiliateUrl).trim() !== "") {
      fail(`${label}: non-affiliate searches must not include affiliateUrl`);
    }
    if (search.disclosureRequired) {
      fail(`${label}: non-affiliate searches should set disclosureRequired=false`);
    }
    if (!relTokens.has("nofollow")) {
      fail(`${label}: non-affiliate marketplace searches must use rel including "nofollow"`);
    }
    if (relTokens.has("sponsored")) {
      fail(`${label}: non-affiliate marketplace searches must not use rel including "sponsored"`);
    }
  }
}

function validatePagePath(value, label, field) {
  if (!requireString({ [field]: value }, field, label)) return;
  if (value.startsWith("/") || value.includes("\\") || value.includes("..")) {
    fail(`${label}: ${field} must be a safe repo-relative public path`);
  }
  if (!value.endsWith("/")) {
    fail(`${label}: ${field} must end with "/"`);
  }
}

function inspectStrings(value, label, stack = []) {
  if (typeof value === "string") {
    for (const pattern of unsafeStringPatterns) {
      if (pattern.test(value)) {
        fail(`${label}: unsafe local/capture path marker at ${stack.join(".")}`);
      }
    }
    if (mojibakePattern.test(value)) {
      fail(`${label}: possible mojibake marker at ${stack.join(".")}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectStrings(item, label, [...stack, index]));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      inspectStrings(nested, label, [...stack, key]);
    }
  }
}

function uniqueById(records, collectionName) {
  const map = new Map();
  for (const record of records) {
    if (!record.id) continue;
    if (map.has(record.id)) {
      fail(`${collectionName}: duplicate id "${record.id}"`);
    }
    map.set(record.id, record);
  }
  return map;
}

function checkRefs(ids, map, label, field) {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    if (!map.has(id)) {
      fail(`${label}: ${field} references missing id "${id}"`);
    }
  }
}

function hasVerifyingSource(ids, sourceMap) {
  return (
    Array.isArray(ids) &&
    ids.some((id) => {
      const source = sourceMap.get(id);
      return source && sourceTypesThatCanVerifyFacts.has(source.type);
    })
  );
}

const works = readCollection("works");
const campaigns = readCollection("campaigns");
const items = readCollection("items");
const sources = readCollection("sources");
const assets = readCollection("assets");

const workMap = uniqueById(works, "works");
const campaignMap = uniqueById(campaigns, "campaigns");
const itemMap = uniqueById(items, "items");
const sourceMap = uniqueById(sources, "sources");
const assetMap = uniqueById(assets, "assets");

for (const record of [...works, ...campaigns, ...items, ...sources, ...assets]) {
  const label = `${record.__file}:${record.id ?? "(missing id)"}`;
  inspectStrings(record, label);
  validateId(record, label);
}

for (const work of works) {
  const label = `${work.__file}:${work.id}`;
  validateStatus(work, label);
  requireString(work, "officialNameJa", label);
  requireString(work, "displayNameEn", label);
  requireString(work, "slug", label);

  if (work.status === "published") {
    requireString(work, "summaryEn", label);
    requireArray(work, "aliases", label);
  }
}

for (const source of sources) {
  const label = `${source.__file}:${source.id}`;
  requireString(source, "type", label);
  if (!allowedSourceTypes.has(source.type)) {
    fail(`${label}: unsupported source type "${source.type}"`);
  }
  validateUrl(source.url, label, "url");
  requireString(source, "label", label);
  requireString(source, "checkedAt", label);
  validateIsoDate(source.checkedAt, label, "checkedAt");
}

for (const asset of assets) {
  const label = `${asset.__file}:${asset.id}`;
  requireString(asset, "path", label);
  requireString(asset, "altJa", label);
  requireString(asset, "sourceId", label);
  checkRefs([asset.sourceId], sourceMap, label, "sourceId");
  const assetSource = sourceMap.get(asset.sourceId);
  if (assetSource?.type === "marketplace-reference") {
    fail(`${label}: asset sourceId cannot point to a marketplace-reference source`);
  }

  const normalizedAssetPath = asset.path.replace(/\\/g, "/");
  if (path.isAbsolute(asset.path) || normalizedAssetPath.includes("..")) {
    fail(`${label}: asset path must be repo-relative and stay inside the repo`);
  } else if (!normalizedAssetPath.startsWith("assets/images/")) {
    fail(`${label}: asset path must be under assets/images/`);
  } else if (!/\.(avif|gif|jpe?g|png|svg|webp)$/i.test(normalizedAssetPath)) {
    fail(`${label}: asset path must point to an image file`);
  } else if (!fs.existsSync(path.join(rootDir, asset.path))) {
    fail(`${label}: asset path does not exist (${asset.path})`);
  }

  if (asset.role === "product") {
    if (asset.loading !== "lazy") {
      fail(`${label}: product assets should use loading=\"lazy\"`);
    }
    if (asset.decoding !== "async") {
      fail(`${label}: product assets should use decoding=\"async\"`);
    }
  }
}

for (const campaign of campaigns) {
  const label = `${campaign.__file}:${campaign.id}`;
  validateStatus(campaign, label);
  requireString(campaign, "workId", label);
  requireString(campaign, "officialTitleJa", label);
  requireString(campaign, "displayTitleEn", label);
  requireString(campaign, "slug", label);
  requireString(campaign, "periodLabel", label);
  requireString(campaign, "checkedAt", label);
  requireArray(campaign, "sourceIds", label);
  requireArray(campaign, "itemIds", label);
  validateIsoDate(campaign.checkedAt, label, "checkedAt");
  validateIsoDate(campaign.startDate, label, "startDate");
  validateIsoDate(campaign.endDate, label, "endDate");

  if ("sources" in campaign || "items" in campaign) {
    fail(`${label}: use sourceIds/itemIds instead of ambiguous sources/items`);
  }

  checkRefs([campaign.workId], workMap, label, "workId");
  checkRefs(campaign.sourceIds, sourceMap, label, "sourceIds");
  checkRefs(campaign.itemIds, itemMap, label, "itemIds");
  for (const itemId of campaign.itemIds ?? []) {
    const item = itemMap.get(itemId);
    if (item && item.campaignId !== campaign.id) {
      fail(`${label}: itemIds includes ${itemId}, but that item belongs to ${item.campaignId}`);
    }
  }

  if (!hasVerifyingSource(campaign.sourceIds, sourceMap)) {
    fail(`${label}: sourceIds must include at least one official or partner-official source`);
  }

  if (Array.isArray(campaign.categories)) {
    for (const category of campaign.categories) {
      if (!allowedCategories.has(category)) {
        fail(`${label}: unsupported category "${category}"`);
      }
    }
  }

  if (campaign.status === "published") {
    requireString(campaign, "summaryEn", label);
    requireArray(campaign, "searchKeywords", label);
    requireArray(campaign, "partnerNames", label);
    requireArray(campaign, "categories", label);
    requireString(campaign, "heroAssetId", label);
    checkRefs([campaign.heroAssetId], assetMap, label, "heroAssetId");
    if (requireObject(campaign, "cardMeta", label)) {
      requireString(campaign.cardMeta, "period", `${label}:cardMeta`);
      requireString(campaign.cardMeta, "source", `${label}:cardMeta`);
      requireString(campaign.cardMeta, "items", `${label}:cardMeta`);
    }
  }
}

for (const item of items) {
  const label = `${item.__file}:${item.id}`;
  const finderPublished = item.marketplaceFinder?.status === "published";
  requireString(item, "campaignId", label);
  requireString(item, "officialNameJa", label);
  requireString(item, "category", label);
  requireString(item, "recordType", label);
  requireString(item, "distributionType", label);
  requireArray(item, "sourceIds", label);
  requireString(item, "confidence", label);
  requireString(item, "descriptionJa", label);
  requireString(item, "acquisitionMethodJa", label);
  validateIsoDate(item.startDate, label, "startDate");
  validateIsoDate(item.endDate, label, "endDate");

  if (!allowedCategories.has(item.category)) {
    fail(`${label}: unsupported item category "${item.category}"`);
  }
  if (!allowedRecordTypes.has(item.recordType)) {
    fail(`${label}: unsupported recordType "${item.recordType}"`);
  }
  if (!allowedDistributionTypes.has(item.distributionType)) {
    fail(`${label}: unsupported distributionType "${item.distributionType}"`);
  }
  if (!allowedConfidence.has(item.confidence)) {
    fail(`${label}: unsupported confidence "${item.confidence}"`);
  }

  checkRefs([item.campaignId], campaignMap, label, "campaignId");
  checkRefs(item.sourceIds, sourceMap, label, "sourceIds");
  checkRefs(item.assetIds ?? [], assetMap, label, "assetIds");
  checkRefs(item.productGrid?.miniGridAssetIds ?? [], assetMap, label, "productGrid.miniGridAssetIds");

  if (item.productGrid !== undefined && requireObject(item, "productGrid", label)) {
    const productGridLabel = `${label}:productGrid`;
    if (item.productGrid.layout !== undefined) {
      requireString(item.productGrid, "layout", productGridLabel);
      if (
        typeof item.productGrid.layout === "string" &&
        !allowedProductGridLayouts.has(item.productGrid.layout)
      ) {
        fail(`${productGridLabel}: unsupported layout "${item.productGrid.layout}"`);
      }
    }
    if (item.productGrid.miniGridAssetIds !== undefined) {
      requireArray(item.productGrid, "miniGridAssetIds", productGridLabel);
      if (item.productGrid.layout !== "wide-mini-grid") {
        fail(`${productGridLabel}: miniGridAssetIds requires layout "wide-mini-grid"`);
      }
    }
    if (item.productGrid.layout === "wide-mini-grid") {
      if (!Array.isArray(item.productGrid.miniGridAssetIds) || item.productGrid.miniGridAssetIds.length === 0) {
        fail(`${productGridLabel}: layout "wide-mini-grid" requires miniGridAssetIds`);
      }
      const itemAssetIds = new Set(item.assetIds ?? []);
      const miniGridAssetIds = new Set(item.productGrid.miniGridAssetIds ?? []);
      for (const assetId of itemAssetIds) {
        if (!miniGridAssetIds.has(assetId)) {
          fail(`${productGridLabel}: miniGridAssetIds must include item asset "${assetId}"`);
        }
      }
      for (const assetId of miniGridAssetIds) {
        if (!itemAssetIds.has(assetId)) {
          fail(`${productGridLabel}: miniGridAssetIds includes asset "${assetId}" not present in item.assetIds`);
        }
      }
    }
  }

  if (!hasVerifyingSource(item.sourceIds, sourceMap)) {
    fail(`${label}: sourceIds must include at least one official or partner-official source`);
  }

  if (item.confidence === "official") {
    for (const id of item.sourceIds) {
      const source = sourceMap.get(id);
      if (source?.type === "marketplace-reference") {
        fail(`${label}: marketplace-reference cannot verify an official item`);
      }
    }
  }

  if (Array.isArray(item.marketplaceSearches)) {
    const marketplaceSearchIds = new Set();
    for (const [index, search] of item.marketplaceSearches.entries()) {
      const searchLabel = `${label}:marketplaceSearches[${index}]`;
      validateMarketplaceSearch(search, searchLabel);
      if (finderPublished) {
        requireString(search, "finderGroup", searchLabel);
      }
      if (typeof search.id === "string") {
        if (marketplaceSearchIds.has(search.id)) {
          fail(`${searchLabel}: duplicate marketplace search id "${search.id}"`);
        }
        marketplaceSearchIds.add(search.id);
      }
    }
  }

  if (item.marketplaceFinder !== undefined) {
    if (requireObject(item, "marketplaceFinder", label)) {
      const finderLabel = `${label}:marketplaceFinder`;
      validateStatus(item.marketplaceFinder, finderLabel);
      if (item.marketplaceFinder.status === "published" && item.page?.status !== "published") {
        fail(`${finderLabel}: published Marketplace Finder requires a published item page`);
      }
      if (
        item.marketplaceFinder.status === "published" &&
        (!Array.isArray(item.marketplaceSearches) || item.marketplaceSearches.length === 0)
      ) {
        fail(`${finderLabel}: published Marketplace Finder requires marketplaceSearches`);
      }
    }
  }

  if (item.page !== undefined) {
    if (requireObject(item, "page", label)) {
      const pageLabel = `${label}:page`;
      validateStatus(item.page, pageLabel);
      requireString(item.page, "slug", pageLabel);
      if (typeof item.page.slug === "string" && !idPattern.test(item.page.slug)) {
        fail(`${pageLabel}: slug "${item.page.slug}" must be lowercase kebab-case`);
      }
      validatePagePath(item.page.path, pageLabel, "path");

      if (item.page.status === "published") {
        requireString(item, "summaryEn", label);
        const hasPagePath = typeof item.page.path === "string" && item.page.path.trim() !== "";
        const campaign = campaignMap.get(item.campaignId);
        if (hasPagePath && campaign) {
          const expectedPath = `works/${campaign.workId}/collabs/${campaign.slug}/items/${item.page.slug}/`;
          if (item.page.path !== expectedPath) {
            fail(`${pageLabel}: path must be "${expectedPath}"`);
          }
        }
        if (hasPagePath) {
          const htmlPath = path.join(rootDir, item.page.path, "index.html");
          if (!fs.existsSync(htmlPath)) {
            fail(`${pageLabel}: published item page is missing ${path.relative(rootDir, htmlPath)}`);
          }
        }
      }
    }
  }

  if (campaignMap.get(item.campaignId)?.status === "published") {
    requireString(item, "displayNameEn", label);
    requireArray(item, "assetIds", label);
  }
}

for (const campaign of campaigns) {
  const campaignItems = (campaign.itemIds ?? [])
    .map((id) => itemMap.get(id))
    .filter(Boolean);

  for (const item of campaignItems) {
    if (!campaign.categories?.includes(item.category)) {
      fail(`${campaign.__file}:${campaign.id}: categories must include item category "${item.category}" from ${item.id}`);
    }
  }

  const hasMarketplaceSearches = campaignItems.some(
    (item) => Array.isArray(item.marketplaceSearches) && item.marketplaceSearches.length > 0,
  );
  if (hasMarketplaceSearches && campaign.marketNoteRequired !== true) {
    fail(`${campaign.__file}:${campaign.id}: marketNoteRequired must be true when items include marketplace searches`);
  }
}

if (warnings.length > 0) {
  for (const message of warnings) {
    console.warn(`Warning: ${message}`);
  }
}

if (errors.length > 0) {
  console.error("Data checks failed:");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log(
  `Data checks passed: ${works.length} works, ${campaigns.length} campaigns, ${items.length} items, ${sources.length} sources, ${assets.length} assets.`,
);
