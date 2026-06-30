#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OFFICIAL_SOURCE_TYPES = new Set(["official", "partner-official"]);
const SOURCE_TYPES = new Set(["official", "partner-official", "marketplace-reference", "archive-reference"]);
const PACKAGE_STATUSES = new Set(["draft", "needs-human-review", "research-ready-for-codex"]);
const PAGE_DECISIONS = new Set(["generate", "parent-card-only", "defer", "never"]);
const PRIORITIES = new Set(["high", "medium", "low", "none"]);
const REQUIRED_NON_AFFILIATE_REL = ["nofollow", "noopener", "noreferrer"];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function labelFor(filePath, suffix = "") {
  return suffix ? `${filePath}:${suffix}` : filePath;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: failed to read JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function push(errors, label, message) {
  errors.push(`${label}: ${message}`);
}

function requireObject(parent, key, label, errors) {
  if (!isObject(parent?.[key])) {
    push(errors, label, `${key} must be an object`);
    return null;
  }
  return parent[key];
}

function requireArray(parent, key, label, errors, { minItems = 0 } = {}) {
  if (!Array.isArray(parent?.[key])) {
    push(errors, label, `${key} must be an array`);
    return [];
  }
  if (parent[key].length < minItems) {
    push(errors, label, `${key} must contain at least ${minItems} item(s)`);
  }
  return parent[key];
}

function requireString(parent, key, label, errors, { kebab = false, minLength = 1 } = {}) {
  const value = parent?.[key];
  if (typeof value !== "string" || value.trim().length < minLength) {
    push(errors, label, `${key} must be a non-empty string`);
    return "";
  }
  if (kebab && !ID_PATTERN.test(value)) {
    push(errors, label, `${key} "${value}" must be lowercase kebab-case`);
  }
  return value;
}

function requireBoolean(parent, key, label, errors) {
  const value = parent?.[key];
  if (typeof value !== "boolean") {
    push(errors, label, `${key} must be a boolean`);
    return false;
  }
  return value;
}

function validateIsoDate(value, label, key, errors) {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    push(errors, label, `${key} must be an ISO date (YYYY-MM-DD)`);
  }
}

function indexById(entries, label, errors) {
  const map = new Map();
  for (const [index, entry] of entries.entries()) {
    const entryLabel = `${label}[${index}]`;
    if (!isObject(entry)) {
      push(errors, entryLabel, "entry must be an object");
      continue;
    }
    const id = requireString(entry, "id", entryLabel, errors, { kebab: true });
    if (!id) continue;
    if (map.has(id)) {
      push(errors, entryLabel, `duplicate id "${id}"`);
    }
    map.set(id, entry);
  }
  return map;
}

function checkRefs(ids, map, label, fieldName, errors) {
  for (const id of ids) {
    if (typeof id !== "string" || id.trim() === "") {
      push(errors, label, `${fieldName} contains a non-string id`);
      continue;
    }
    if (!map.has(id)) {
      push(errors, label, `${fieldName} references missing id "${id}"`);
    }
  }
}

function hasOfficialSource(ids, sourceMap) {
  return ids.some((id) => OFFICIAL_SOURCE_TYPES.has(sourceMap.get(id)?.type));
}

function relTokens(rel) {
  return new Set(String(rel ?? "").split(/\s+/).filter(Boolean));
}

function validateSource(source, label, errors) {
  requireString(source, "id", label, errors, { kebab: true });
  const type = requireString(source, "type", label, errors);
  if (type && !SOURCE_TYPES.has(type)) {
    push(errors, label, `unsupported source type "${type}"`);
  }
  requireString(source, "url", label, errors);
  requireString(source, "label", label, errors);
  requireString(source, "scope", label, errors);
  requireString(source, "language", label, errors, { minLength: 2 });
  validateIsoDate(source.checkedAt, label, "checkedAt", errors);
}

function validateEvidence(evidence, label, sourceMap, errors) {
  requireString(evidence, "id", label, errors, { kebab: true });
  const sourceId = requireString(evidence, "sourceId", label, errors, { kebab: true });
  requireString(evidence, "factType", label, errors);
  if (typeof evidence.claimJa !== "string" && typeof evidence.claimEn !== "string") {
    push(errors, label, "claimJa or claimEn is required");
  }
  const locator = requireObject(evidence, "sourceLocator", label, errors);
  if (locator) {
    requireString(locator, "sectionLabel", `${label}:sourceLocator`, errors);
    if (typeof locator.quoteShortJa !== "string" && typeof locator.note !== "string") {
      push(errors, `${label}:sourceLocator`, "quoteShortJa or note is required");
    }
  }
  requireBoolean(evidence, "reviewRequired", label, errors);
  requireString(evidence, "confidence", label, errors);

  const source = sourceMap.get(sourceId);
  if (!source) {
    push(errors, label, `sourceId references missing source "${sourceId}"`);
  } else if (!OFFICIAL_SOURCE_TYPES.has(source.type)) {
    push(errors, label, `evidence must use official or partner-official source, not "${source.type}"`);
  }
}

function validateAsset(asset, label, sourceMap, errors) {
  requireString(asset, "id", label, errors, { kebab: true });
  requireString(asset, "role", label, errors);
  const sourceId = requireString(asset, "sourceId", label, errors, { kebab: true });
  requireString(asset, "localPath", label, errors);
  requireString(asset, "altJa", label, errors);
  requireString(asset, "usage", label, errors);
  requireString(asset, "downloadPolicy", label, errors);
  requireString(asset, "rightsNote", label, errors);

  if (!sourceMap.has(sourceId)) {
    push(errors, label, `sourceId references missing source "${sourceId}"`);
  }
  if (typeof asset.localPath === "string" && !asset.localPath.startsWith("assets/images/")) {
    push(errors, label, "localPath must stay under assets/images/");
  }
}

function validateMarketplaceSearch(search, label, marketplacePolicy, errors) {
  requireString(search, "id", label, errors, { kebab: true });
  requireString(search, "platform", label, errors);
  requireString(search, "labelJa", label, errors);
  requireString(search, "labelEn", label, errors);
  requireString(search, "query", label, errors);
  requireString(search, "url", label, errors);
  requireString(search, "intent", label, errors);
  requireString(search, "finderGroup", label, errors);
  requireString(search, "region", label, errors);
  const isAffiliate = requireBoolean(search, "isAffiliate", label, errors);
  const disclosureRequired = requireBoolean(search, "disclosureRequired", label, errors);
  const rel = requireString(search, "rel", label, errors);
  const tokens = relTokens(rel);

  if (isAffiliate) {
    if (marketplacePolicy.affiliateEnabled !== true) {
      push(errors, label, "isAffiliate=true requires marketplacePolicy.affiliateEnabled=true");
    }
    if (!tokens.has("sponsored")) {
      push(errors, label, "affiliate links must include rel token sponsored");
    }
    if (disclosureRequired !== true) {
      push(errors, label, "affiliate links require disclosureRequired=true");
    }
  } else {
    for (const token of REQUIRED_NON_AFFILIATE_REL) {
      if (!tokens.has(token)) {
        push(errors, label, `non-affiliate links must include rel token ${token}`);
      }
    }
    if (tokens.has("sponsored")) {
      push(errors, label, "non-affiliate links must not include rel token sponsored");
    }
    if (disclosureRequired !== false) {
      push(errors, label, "non-affiliate links must use disclosureRequired=false");
    }
  }
}

function validatePageDecision(item, label, errors) {
  const pageDecision = requireObject(item, "pageDecision", label, errors);
  if (!pageDecision) return "";

  const decision = requireString(pageDecision, "decision", `${label}:pageDecision`, errors);
  if (decision && !PAGE_DECISIONS.has(decision)) {
    push(errors, `${label}:pageDecision`, `unsupported decision "${decision}"`);
  }

  const priority = requireString(pageDecision, "priority", `${label}:pageDecision`, errors);
  if (priority && !PRIORITIES.has(priority)) {
    push(errors, `${label}:pageDecision`, `unsupported priority "${priority}"`);
  }

  requireString(pageDecision, "reason", `${label}:pageDecision`, errors);

  if (decision === "generate") {
    requireString(pageDecision, "slug", `${label}:pageDecision`, errors, { kebab: true });
  }

  if (decision !== "generate" && typeof pageDecision.slug === "string") {
    push(errors, `${label}:pageDecision`, "slug should only be set for decision=generate");
  }

  return decision;
}

function validateItem(item, context) {
  const { label, campaign, sourceMap, evidenceMap, assetMap, marketplacePolicy, errors } = context;
  const id = requireString(item, "id", label, errors, { kebab: true });
  const campaignId = requireString(item, "campaignId", label, errors, { kebab: true });
  requireString(item, "officialNameJa", label, errors);
  requireString(item, "displayNameEn", label, errors);
  requireString(item, "summaryEn", label, errors);
  requireString(item, "category", label, errors);
  requireString(item, "recordType", label, errors);
  requireString(item, "distributionType", label, errors);
  requireString(item, "descriptionJa", label, errors);
  requireString(item, "acquisitionMethodJa", label, errors);

  if (campaignId && campaignId !== campaign.id) {
    push(errors, label, `campaignId must match campaign.id "${campaign.id}"`);
  }

  const sourceIds = requireArray(item, "sourceIds", label, errors, { minItems: 1 });
  const evidenceRefs = requireArray(item, "evidenceRefs", label, errors, { minItems: 1 });
  const assetIds = requireArray(item, "assetIds", label, errors, { minItems: 1 });

  checkRefs(sourceIds, sourceMap, label, "sourceIds", errors);
  checkRefs(evidenceRefs, evidenceMap, label, "evidenceRefs", errors);
  checkRefs(assetIds, assetMap, label, "assetIds", errors);

  if (!hasOfficialSource(sourceIds, sourceMap)) {
    push(errors, label, "sourceIds must include at least one official or partner-official source");
  }

  for (const evidenceId of evidenceRefs) {
    const evidence = evidenceMap.get(evidenceId);
    if (!evidence) continue;
    const source = sourceMap.get(evidence.sourceId);
    if (!source || !OFFICIAL_SOURCE_TYPES.has(source.type)) {
      push(errors, label, `evidenceRefs includes non-official evidence "${evidenceId}"`);
    }
  }

  const decision = validatePageDecision(item, label, errors);
  const searches = Array.isArray(item.marketplaceSearches) ? item.marketplaceSearches : [];
  const searchIds = new Set();
  for (const [index, search] of searches.entries()) {
    const searchLabel = `${label}:marketplaceSearches[${index}]`;
    validateMarketplaceSearch(search, searchLabel, marketplacePolicy, errors);
    if (typeof search.id === "string") {
      if (searchIds.has(search.id)) {
        push(errors, searchLabel, `duplicate marketplace search id "${search.id}"`);
      }
      searchIds.add(search.id);
    }
  }

  if (decision === "generate") {
    if (searches.length === 0) {
      push(errors, label, "decision=generate requires at least one marketplaceSearches entry");
    }
    if (!item.summaryEn || String(item.summaryEn).length < 40) {
      push(errors, label, "decision=generate requires a substantial unique summaryEn");
    }
  }

  return {
    id,
    decision,
    slug: item.pageDecision?.slug,
    summaryEn: item.summaryEn,
  };
}

function validatePolicies(pkg, label, errors) {
  const pageGenerationPolicy = requireObject(pkg, "pageGenerationPolicy", label, errors) ?? {};
  const campaignPage = requireObject(pageGenerationPolicy, "campaignPage", `${label}:pageGenerationPolicy`, errors) ?? {};
  const itemPages = requireObject(pageGenerationPolicy, "itemPages", `${label}:pageGenerationPolicy`, errors) ?? {};
  const sitemap = requireObject(pageGenerationPolicy, "sitemap", `${label}:pageGenerationPolicy`, errors) ?? {};
  const seo = requireObject(pageGenerationPolicy, "seo", `${label}:pageGenerationPolicy`, errors) ?? {};

  if (requireBoolean(campaignPage, "generate", `${label}:pageGenerationPolicy.campaignPage`, errors) !== true) {
    push(errors, `${label}:pageGenerationPolicy.campaignPage`, "generate must be true for the pilot workflow");
  }
  requireString(campaignPage, "route", `${label}:pageGenerationPolicy.campaignPage`, errors);

  const generateForDecisions = requireArray(
    itemPages,
    "generateForDecisions",
    `${label}:pageGenerationPolicy.itemPages`,
    errors,
    { minItems: 1 },
  );
  if (!generateForDecisions.includes("generate")) {
    push(errors, `${label}:pageGenerationPolicy.itemPages`, "generateForDecisions must include generate");
  }
  if (requireBoolean(itemPages, "deferParentCardOnly", `${label}:pageGenerationPolicy.itemPages`, errors) !== true) {
    push(errors, `${label}:pageGenerationPolicy.itemPages`, "deferParentCardOnly must be true");
  }
  if (requireBoolean(itemPages, "doNotGenerateVariantPages", `${label}:pageGenerationPolicy.itemPages`, errors) !== true) {
    push(errors, `${label}:pageGenerationPolicy.itemPages`, "doNotGenerateVariantPages must be true");
  }

  if (requireBoolean(sitemap, "includeGeneratedPages", `${label}:pageGenerationPolicy.sitemap`, errors) !== true) {
    push(errors, `${label}:pageGenerationPolicy.sitemap`, "includeGeneratedPages must be true");
  }
  for (const flag of ["avoidThinPages", "requireUniqueSummaryEn", "requireEvidenceForFacts"]) {
    if (requireBoolean(seo, flag, `${label}:pageGenerationPolicy.seo`, errors) !== true) {
      push(errors, `${label}:pageGenerationPolicy.seo`, `${flag} must be true`);
    }
  }

  const marketplacePolicy = requireObject(pkg, "marketplacePolicy", label, errors) ?? {};
  for (const flag of ["officialSourcesSeparate", "noLiveAvailabilityClaims", "noPriceOrAuthenticityClaims"]) {
    if (requireBoolean(marketplacePolicy, flag, `${label}:marketplacePolicy`, errors) !== true) {
      push(errors, `${label}:marketplacePolicy`, `${flag} must be true`);
    }
  }
  requireBoolean(marketplacePolicy, "affiliateEnabled", `${label}:marketplacePolicy`, errors);

  return { pageGenerationPolicy, marketplacePolicy };
}

function validatePackage(pkg, filePath) {
  const errors = [];
  const label = filePath;

  if (!isObject(pkg)) {
    return [`${filePath}: package must be an object`];
  }

  const version = requireString(pkg, "packageVersion", label, errors);
  if (version && version !== "0.1") {
    push(errors, label, 'packageVersion must be "0.1"');
  }
  requireString(pkg, "packageId", label, errors, { kebab: true });
  validateIsoDate(pkg.createdAt, label, "createdAt", errors);
  requireString(pkg, "createdBy", label, errors);
  const status = requireString(pkg, "status", label, errors);
  if (status && !PACKAGE_STATUSES.has(status)) {
    push(errors, label, `unsupported status "${status}"`);
  }

  const language = requireObject(pkg, "language", label, errors);
  if (language) {
    requireString(language, "official", `${label}:language`, errors, { minLength: 2 });
    requireString(language, "summary", `${label}:language`, errors, { minLength: 2 });
  }

  const work = requireObject(pkg, "work", label, errors) ?? {};
  const campaign = requireObject(pkg, "campaign", label, errors) ?? {};
  const sources = requireArray(pkg, "sources", label, errors, { minItems: 1 });
  const evidence = requireArray(pkg, "evidence", label, errors, { minItems: 1 });
  const assets = requireArray(pkg, "assets", label, errors, { minItems: 1 });
  const items = requireArray(pkg, "items", label, errors, { minItems: 1 });
  const unresolvedQuestions = requireArray(pkg, "unresolvedQuestions", label, errors);
  requireArray(pkg, "humanReviewChecklist", label, errors, { minItems: 1 });
  const { marketplacePolicy } = validatePolicies(pkg, label, errors);

  requireString(work, "id", `${label}:work`, errors, { kebab: true });
  requireString(work, "officialNameJa", `${label}:work`, errors);
  requireString(work, "displayNameEn", `${label}:work`, errors);
  requireString(work, "slug", `${label}:work`, errors, { kebab: true });

  const sourceMap = indexById(sources, `${label}:sources`, errors);
  for (const [index, source] of sources.entries()) {
    if (isObject(source)) validateSource(source, `${label}:sources[${index}]`, errors);
  }

  const evidenceMap = indexById(evidence, `${label}:evidence`, errors);
  for (const [index, entry] of evidence.entries()) {
    if (isObject(entry)) validateEvidence(entry, `${label}:evidence[${index}]`, sourceMap, errors);
  }

  const assetMap = indexById(assets, `${label}:assets`, errors);
  for (const [index, asset] of assets.entries()) {
    if (isObject(asset)) validateAsset(asset, `${label}:assets[${index}]`, sourceMap, errors);
  }

  requireString(campaign, "id", `${label}:campaign`, errors, { kebab: true });
  const campaignWorkId = requireString(campaign, "workId", `${label}:campaign`, errors, { kebab: true });
  if (campaignWorkId && work.id && campaignWorkId !== work.id) {
    push(errors, `${label}:campaign`, `workId must match work.id "${work.id}"`);
  }
  requireString(campaign, "officialTitleJa", `${label}:campaign`, errors);
  requireString(campaign, "displayTitleEn", `${label}:campaign`, errors);
  requireString(campaign, "slug", `${label}:campaign`, errors, { kebab: true });
  requireString(campaign, "periodLabel", `${label}:campaign`, errors);
  validateIsoDate(campaign.checkedAt, `${label}:campaign`, "checkedAt", errors);
  requireArray(campaign, "partnerNames", `${label}:campaign`, errors, { minItems: 1 });
  requireArray(campaign, "categories", `${label}:campaign`, errors, { minItems: 1 });
  requireString(campaign, "summaryEn", `${label}:campaign`, errors);

  const campaignSourceIds = requireArray(campaign, "sourceIds", `${label}:campaign`, errors, { minItems: 1 });
  const campaignItemIds = requireArray(campaign, "itemIds", `${label}:campaign`, errors, { minItems: 1 });
  const campaignEvidenceRefs = requireArray(campaign, "evidenceRefs", `${label}:campaign`, errors, { minItems: 1 });
  checkRefs(campaignSourceIds, sourceMap, `${label}:campaign`, "sourceIds", errors);
  checkRefs(campaignEvidenceRefs, evidenceMap, `${label}:campaign`, "evidenceRefs", errors);
  if (!hasOfficialSource(campaignSourceIds, sourceMap)) {
    push(errors, `${label}:campaign`, "sourceIds must include at least one official or partner-official source");
  }
  for (const evidenceId of campaignEvidenceRefs) {
    const entry = evidenceMap.get(evidenceId);
    const source = entry ? sourceMap.get(entry.sourceId) : null;
    if (!source || !OFFICIAL_SOURCE_TYPES.has(source.type)) {
      push(errors, `${label}:campaign`, `evidenceRefs includes non-official evidence "${evidenceId}"`);
    }
  }

  const itemMap = indexById(items, `${label}:items`, errors);
  checkRefs(campaignItemIds, itemMap, `${label}:campaign`, "itemIds", errors);

  const pageSlugs = new Set();
  const generatedSummaries = new Map();
  for (const [index, item] of items.entries()) {
    if (!isObject(item)) {
      push(errors, `${label}:items[${index}]`, "entry must be an object");
      continue;
    }
    const result = validateItem(item, {
      label: `${label}:items[${index}]`,
      campaign,
      sourceMap,
      evidenceMap,
      assetMap,
      marketplacePolicy,
      errors,
    });
    if (result.decision === "generate" && result.slug) {
      if (pageSlugs.has(result.slug)) {
        push(errors, `${label}:items[${index}]`, `duplicate generated page slug "${result.slug}"`);
      }
      pageSlugs.add(result.slug);
      const summaryKey = String(result.summaryEn ?? "").trim().toLowerCase();
      if (summaryKey) {
        if (generatedSummaries.has(summaryKey)) {
          push(
            errors,
            `${label}:items[${index}]`,
            `summaryEn duplicates generated item ${generatedSummaries.get(summaryKey)}`,
          );
        }
        generatedSummaries.set(summaryKey, result.id);
      }
    }
  }

  for (const [index, question] of unresolvedQuestions.entries()) {
    const qLabel = `${label}:unresolvedQuestions[${index}]`;
    if (!isObject(question)) {
      push(errors, qLabel, "entry must be an object");
      continue;
    }
    requireString(question, "id", qLabel, errors, { kebab: true });
    requireString(question, "question", qLabel, errors);
    requireString(question, "impact", qLabel, errors);
    requireBoolean(question, "publishBlocking", qLabel, errors);
  }

  return errors;
}

function parseArgs(argv) {
  const options = {
    expectFail: false,
    files: [],
  };

  for (const arg of argv) {
    if (arg === "--expect-fail") {
      options.expectFail = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      options.files.push(arg);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/validate-research-package.mjs [--expect-fail] <package.json> [...more.json]

Validates CollabVaultX Research Package JSON before Codex imports or generates pages.

Options:
  --expect-fail  Pass only when every provided package fails validation.
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || options.files.length === 0) {
    printHelp();
    process.exit(options.help ? 0 : 1);
  }

  let failedFiles = 0;
  for (const inputPath of options.files) {
    const filePath = path.normalize(inputPath);
    let errors = [];
    try {
      errors = validatePackage(readJson(filePath), filePath);
    } catch (error) {
      errors = [error instanceof Error ? error.message : String(error)];
    }

    if (errors.length > 0) {
      failedFiles += 1;
      console.error(`Research package validation failed: ${filePath}`);
      for (const error of errors) {
        console.error(`- ${error}`);
      }
    } else {
      console.log(`Research package validation passed: ${filePath}`);
    }
  }

  if (options.expectFail) {
    if (failedFiles === options.files.length) {
      console.log(`Expected failure confirmed for ${failedFiles} package(s).`);
      return;
    }
    console.error("Expected every package to fail validation, but at least one passed.");
    process.exit(1);
  }

  if (failedFiles > 0) {
    process.exit(1);
  }
}

main();
