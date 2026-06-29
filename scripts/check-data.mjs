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

const unsafeStringPatterns = [
  /AppData/i,
  /[\\/]Temp[\\/]/i,
  /collabvaultx-visual-diffs/i,
  /browser[-_ ]?profile/i,
  /cookies?/i,
  /\.pdf\b/i,
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

  if (path.isAbsolute(asset.path) || asset.path.includes("..")) {
    fail(`${label}: asset path must be repo-relative and stay inside the repo`);
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
    for (const [index, search] of item.marketplaceSearches.entries()) {
      const searchLabel = `${label}:marketplaceSearches[${index}]`;
      requireString(search, "platform", searchLabel);
      requireString(search, "queryLabel", searchLabel);
      validateUrl(search.url, searchLabel, "url");
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
