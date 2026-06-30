#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractMarketplaceFinderSection,
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

export const SUPPORTED_ITEM_SHELL_CAMPAIGN_IDS = [
  "round1-collab-campaign-202510",
  "lawson-cinderellagray-campaign-202511",
  "cocos-umaimono-fes-202601",
];

const WORK_NAV_LABEL_BY_ID = new Map([["umamusume", "ウマ娘"]]);
const CAMPAIGN_NAV_LABEL_BY_ID = new Map([
  ["round1-collab-campaign-202510", "ROUND1"],
  ["lawson-cinderellagray-campaign-202511", "ローソン"],
  ["cocos-umaimono-fes-202601", "COCOS"],
]);

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

function pagePathToHtmlPath(pagePath) {
  return pagePath.endsWith("/") ? `${pagePath}index.html` : pagePath;
}

function relativeUrl(fromHtmlPath, targetRepoPath) {
  const fromDir = path.posix.dirname(fromHtmlPath.replace(/\\/g, "/"));
  const target = targetRepoPath.replace(/\\/g, "/");
  const relative = path.posix.relative(fromDir, target);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function publicUrlForPath(pagePath) {
  const host = fs.existsSync(path.join(rootDir, "CNAME")) ? readText("CNAME").trim() : "";
  const normalized = pagePath.replace(/^\/+/, "");
  return host ? `https://${host}/${normalized}` : `/${normalized}`;
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeHtml(html) {
  return String(html ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function getAttribute(openingTag, name) {
  const pattern = new RegExp(`${name}=(["'])(.*?)\\1`);
  return openingTag.match(pattern)?.[2] ?? "";
}

function setAttribute(openingTag, name, value) {
  const escaped = escapeAttribute(value);
  const pattern = new RegExp(`\\b${name}=(["'])(.*?)\\1`);
  if (pattern.test(openingTag)) {
    return openingTag.replace(pattern, `${name}="${escaped}"`);
  }

  return openingTag.replace(/\s*\/?>$/, (ending) => ` ${name}="${escaped}"${ending}`);
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

function replaceTitle(html, value) {
  if (!/<title>[\s\S]*?<\/title>/.test(html)) return html;
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeText(value)}</title>`);
}

function replaceMatchingOpeningTag(html, tagName, selectorAttribute, selectorValue, update) {
  const pattern = new RegExp(
    `<${tagName}\\b(?=[^>]*\\b${selectorAttribute}=(["'])${escapeRegExp(selectorValue)}\\1)[^>]*>`,
  );
  return html.replace(pattern, (openingTag) => update(openingTag));
}

function replaceCanonicalHref(html, value) {
  return replaceMatchingOpeningTag(html, "link", "rel", "canonical", (openingTag) =>
    setAttribute(openingTag, "href", value),
  );
}

function replaceMetaContent(html, propertyName, value) {
  return replaceMatchingOpeningTag(html, "meta", "property", propertyName, (openingTag) =>
    setAttribute(openingTag, "content", value),
  );
}

function replaceNamedMetaContent(html, name, value) {
  return replaceMatchingOpeningTag(html, "meta", "name", name, (openingTag) =>
    setAttribute(openingTag, "content", value),
  );
}

function expectedCampaignTitleForItemPage(campaign) {
  return String(campaign.officialTitleJa ?? "").replace(/\s*コラボキャンペーン$/, "");
}

export function expectedItemPageMetadata(item, campaign, asset) {
  const title = `${item.officialNameJa} | ${expectedCampaignTitleForItemPage(campaign)} | CollabVaultX`;
  const publicUrl = publicUrlForPath(item.page.path);
  const ogImage = publicUrlForPath(asset.path);

  return {
    title,
    description: item.summaryEn,
    canonical: publicUrl,
    ogSiteName: "CollabVaultX",
    ogType: "article",
    ogTitle: title,
    ogDescription: item.summaryEn,
    ogUrl: publicUrl,
    ogImage,
    ogImageAlt: asset.altJa,
    twitterTitle: title,
    twitterDescription: item.summaryEn,
    twitterImage: ogImage,
    twitterCard: "summary_large_image",
  };
}

function applyExpectedMetadata(html, metadata) {
  let nextHtml = html;
  nextHtml = replaceTitle(nextHtml, metadata.title);
  nextHtml = replaceNamedMetaContent(nextHtml, "description", metadata.description);
  nextHtml = replaceCanonicalHref(nextHtml, metadata.canonical);
  nextHtml = replaceMetaContent(nextHtml, "og:site_name", metadata.ogSiteName);
  nextHtml = replaceMetaContent(nextHtml, "og:type", metadata.ogType);
  nextHtml = replaceMetaContent(nextHtml, "og:title", metadata.ogTitle);
  nextHtml = replaceMetaContent(nextHtml, "og:description", metadata.ogDescription);
  nextHtml = replaceMetaContent(nextHtml, "og:url", metadata.ogUrl);
  nextHtml = replaceMetaContent(nextHtml, "og:image", metadata.ogImage);
  nextHtml = replaceMetaContent(nextHtml, "og:image:alt", metadata.ogImageAlt);
  nextHtml = replaceNamedMetaContent(nextHtml, "twitter:title", metadata.twitterTitle);
  nextHtml = replaceNamedMetaContent(nextHtml, "twitter:description", metadata.twitterDescription);
  nextHtml = replaceNamedMetaContent(nextHtml, "twitter:image", metadata.twitterImage);
  nextHtml = replaceNamedMetaContent(nextHtml, "twitter:card", metadata.twitterCard);
  return nextHtml;
}

function assertEqual(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: expected "${expected}", got "${actual}"`);
  }
}

function validateMetadata(html, metadata, label, errors) {
  const title = decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "");
  assertEqual(errors, `${label} title`, title, metadata.title);
  assertEqual(errors, `${label} meta description`, getNamedMetaContent(html, "description"), metadata.description);
  assertEqual(errors, `${label} canonical`, getCanonicalUrl(html), metadata.canonical);
  assertEqual(errors, `${label} og:site_name`, getMetaContent(html, "og:site_name"), metadata.ogSiteName);
  assertEqual(errors, `${label} og:type`, getMetaContent(html, "og:type"), metadata.ogType);
  assertEqual(errors, `${label} og:title`, getMetaContent(html, "og:title"), metadata.ogTitle);
  assertEqual(errors, `${label} og:description`, getMetaContent(html, "og:description"), metadata.ogDescription);
  assertEqual(errors, `${label} og:url`, getMetaContent(html, "og:url"), metadata.ogUrl);
  assertEqual(errors, `${label} og:image`, getMetaContent(html, "og:image"), metadata.ogImage);
  assertEqual(errors, `${label} og:image:alt`, getMetaContent(html, "og:image:alt"), metadata.ogImageAlt);
  assertEqual(errors, `${label} twitter:title`, getNamedMetaContent(html, "twitter:title"), metadata.twitterTitle);
  assertEqual(errors, `${label} twitter:description`, getNamedMetaContent(html, "twitter:description"), metadata.twitterDescription);
  assertEqual(errors, `${label} twitter:image`, getNamedMetaContent(html, "twitter:image"), metadata.twitterImage);
  assertEqual(errors, `${label} twitter:card`, getNamedMetaContent(html, "twitter:card"), metadata.twitterCard);
}

function sectionIndent(html, sectionStart) {
  const lineStart = html.lastIndexOf("\n", sectionStart) + 1;
  return html.slice(lineStart, sectionStart).match(/^\s*/)?.[0] ?? "          ";
}

function extractBlock(html, startPattern, endTag, label) {
  const startMatch = html.match(startPattern);
  if (!startMatch || typeof startMatch.index !== "number") return null;
  const tagStart = startMatch.index;
  const start = html.lastIndexOf("\n", tagStart) + 1;
  const end = html.indexOf(endTag, tagStart);
  if (end === -1) return null;

  return {
    html: html.slice(start, end + endTag.length),
    start,
    end: end + endTag.length,
    indent: sectionIndent(html, start),
    label,
  };
}

function extractBreadcrumbs(html) {
  return extractBlock(html, /<nav\b(?=[^>]*class=(["'])[^"']*\bbreadcrumb-links\b[^"']*\1)[^>]*>/, "</nav>", "breadcrumbs");
}

function extractHeroMedia(html) {
  const picture = extractBlock(
    html,
    /<picture\b(?=[^>]*class=(["'])[^"']*\bsubpage-hero-collab-media\b[^"']*\1)[^>]*>/,
    "</picture>",
    "hero media",
  );
  if (!picture) return null;

  const anchorStart = html.indexOf("<a", picture.end);
  if (anchorStart === -1) return picture;
  const anchorOpeningEnd = html.indexOf(">", anchorStart);
  const anchorOpening = html.slice(anchorStart, anchorOpeningEnd + 1);
  if (!/\bsubpage-hero-collab-link\b/.test(getAttribute(anchorOpening, "class"))) return picture;
  const anchorEnd = html.indexOf("</a>", anchorOpeningEnd);
  if (anchorEnd === -1) return picture;

  return {
    html: html.slice(picture.start, anchorEnd + "</a>".length),
    start: picture.start,
    end: anchorEnd + "</a>".length,
    indent: picture.indent,
    label: "hero media",
  };
}

function extractBackLinks(html) {
  return extractBlock(html, /<nav\b(?=[^>]*class=(["'])[^"']*\breference-links\b[^"']*\1)[^>]*>/, "</nav>", "back links");
}

function workNavLabel(campaign) {
  return WORK_NAV_LABEL_BY_ID.get(campaign.workId) ?? campaign.workId;
}

function campaignNavLabel(campaign) {
  return CAMPAIGN_NAV_LABEL_BY_ID.get(campaign.id) ?? campaign.partnerNames?.[0] ?? campaign.slug;
}

export function renderBreadcrumbs(item, campaign, options = {}) {
  const indent = options.indent ?? "          ";
  const inner = `${indent}  `;
  const itemHtmlPath = pagePathToHtmlPath(item.page.path);
  const topHref = relativeUrl(itemHtmlPath, "index.html");
  const workHref = relativeUrl(itemHtmlPath, `works/${campaign.workId}/index.html`);
  const campaignHref = relativeUrl(itemHtmlPath, `works/${campaign.workId}/collabs/${campaign.slug}/index.html`);

  return [
    `${indent}<nav class="breadcrumb-links" aria-label="パンくず">`,
    `${inner}<a class="back-link" href="${escapeAttribute(topHref)}">← Top page</a>`,
    `${inner}<a class="back-link" href="${escapeAttribute(workHref)}">← ${escapeText(workNavLabel(campaign))}ページ</a>`,
    `${inner}<a class="back-link" href="${escapeAttribute(campaignHref)}">← ${escapeText(campaignNavLabel(campaign))}キャンペーン</a>`,
    `${indent}</nav>`,
  ].join("\n");
}

export function renderHeroMedia(item, asset, options = {}) {
  const indent = options.indent ?? "        ";
  const inner = `${indent}  `;
  const deep = `${indent}    `;
  const itemHtmlPath = pagePathToHtmlPath(item.page.path);
  const assetHref = relativeUrl(itemHtmlPath, asset.path);

  return [
    `${indent}<picture class="subpage-hero-collab-media" aria-hidden="true">`,
    `${inner}<img`,
    `${deep}loading="eager"`,
    `${deep}fetchpriority="high"`,
    `${deep}decoding="async"`,
    `${deep}src="${escapeAttribute(assetHref)}"`,
    `${deep}alt=""`,
    `${inner}/>`,
    `${indent}</picture>`,
    `${indent}<a`,
    `${inner}class="subpage-hero-collab-link"`,
    `${inner}href="${escapeAttribute(assetHref)}"`,
    `${inner}target="_blank"`,
    `${inner}rel="noopener noreferrer"`,
    `${inner}aria-label="${escapeAttribute(`${asset.altJa}を大きく表示`)}"`,
    `${indent}></a>`,
  ].join("\n");
}

export function renderBackLinks(item, campaign, options = {}) {
  const indent = options.indent ?? "            ";
  const inner = `${indent}  `;
  const itemHtmlPath = pagePathToHtmlPath(item.page.path);
  const campaignHref = relativeUrl(itemHtmlPath, `works/${campaign.workId}/collabs/${campaign.slug}/index.html`);
  const workHref = relativeUrl(itemHtmlPath, `works/${campaign.workId}/index.html`);
  const topHref = relativeUrl(itemHtmlPath, "index.html");

  return [
    `${indent}<nav class="reference-links" aria-label="ページ移動">`,
    `${inner}<a href="${escapeAttribute(campaignHref)}">← ${escapeText(campaignNavLabel(campaign))}キャンペーンへ戻る</a>`,
    `${inner}<a href="${escapeAttribute(workHref)}">← ${escapeText(workNavLabel(campaign))}ページへ戻る</a>`,
    `${inner}<a href="${escapeAttribute(topHref)}">← Top pageへ戻る</a>`,
    `${indent}</nav>`,
  ].join("\n");
}

function compareOrReplaceFragment({ html, fragment, expectedHtml, label, errors, write }) {
  if (!fragment) {
    errors.push(`${label}: fragment is missing`);
    return { html, updated: false };
  }

  if (normalizeHtml(fragment.html) === normalizeHtml(expectedHtml)) {
    return { html, updated: false };
  }

  if (!write) {
    errors.push(`${label}: existing fragment does not match renderer output`);
    return { html, updated: false };
  }

  return {
    html: `${html.slice(0, fragment.start)}${expectedHtml}${html.slice(fragment.end)}`,
    updated: true,
  };
}

function processItemPage({ item, campaign, asset, relatedItems, write }) {
  const errors = [];
  const itemHtmlPath = pagePathToHtmlPath(item.page.path);
  const fullPath = path.join(rootDir, itemHtmlPath);
  const label = `${campaign.id} item page ${item.id}`;

  if (!fs.existsSync(fullPath)) {
    return { errors: [`${label}: missing page ${itemHtmlPath}`], updated: false };
  }

  let html = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
  const originalHtml = html;
  const metadata = expectedItemPageMetadata(item, campaign, asset);

  if (write) {
    html = applyExpectedMetadata(html, metadata);
  }
  validateMetadata(html, metadata, label, errors);

  const breadcrumbResult = compareOrReplaceFragment({
    html,
    fragment: extractBreadcrumbs(html),
    expectedHtml: renderBreadcrumbs(item, campaign, { indent: "          " }),
    label: `${label} breadcrumbs`,
    errors,
    write,
  });
  html = breadcrumbResult.html;

  const heroMediaResult = compareOrReplaceFragment({
    html,
    fragment: extractHeroMedia(html),
    expectedHtml: renderHeroMedia(item, asset, { indent: "        " }),
    label: `${label} hero media`,
    errors,
    write,
  });
  html = heroMediaResult.html;

  const finderSection = extractMarketplaceFinderSection(html);
  const finderExpected = finderSection ? renderMarketplaceFinder(item, { indent: finderSection.indent }) : "";
  if (!finderSection) {
    errors.push(`${label}: Marketplace Finder section is missing`);
  } else if (normalizeMarketplaceFinderHtml(finderSection.html) !== normalizeMarketplaceFinderHtml(finderExpected)) {
    if (write) {
      html = `${html.slice(0, finderSection.start)}${finderExpected}${html.slice(finderSection.end)}`;
    } else {
      errors.push(`${label}: Marketplace Finder does not match renderer output`);
    }
  }

  const relatedSection = extractRelatedItemsSection(html);
  const relatedExpected = relatedSection
    ? renderRelatedItems(item, campaign, relatedItems, { indent: relatedSection.indent })
    : "";
  if (!relatedSection) {
    errors.push(`${label}: related item navigation section is missing`);
  } else if (normalizeRelatedItemsHtml(relatedSection.html) !== normalizeRelatedItemsHtml(relatedExpected)) {
    if (write) {
      html = `${html.slice(0, relatedSection.start)}${relatedExpected}${html.slice(relatedSection.end)}`;
    } else {
      errors.push(`${label}: related item navigation does not match renderer output`);
    }
  }

  const nextRelatedSection = extractRelatedItemsSection(html);
  if (nextRelatedSection) {
    errors.push(
      ...validateRelatedItemsStructure({
        item,
        campaign,
        relatedItems,
        sectionHtml: nextRelatedSection.html,
        itemHtmlPath,
        label,
      }),
    );
  }

  const backLinksResult = compareOrReplaceFragment({
    html,
    fragment: extractBackLinks(html),
    expectedHtml: renderBackLinks(item, campaign, { indent: "            " }),
    label: `${label} back links`,
    errors,
    write,
  });
  html = backLinksResult.html;

  if (write && errors.length === 0 && html !== originalHtml) {
    fs.writeFileSync(fullPath, html, "utf8");
  }

  return {
    errors,
    updated: write && html !== originalHtml && errors.length === 0,
  };
}

function parseArgs(argv) {
  const options = {
    write: false,
    check: false,
    campaignIds: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      options.write = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--campaign") {
      const campaignId = argv[index + 1];
      if (!campaignId || campaignId.startsWith("--")) {
        throw new Error("--campaign requires a campaign id");
      }
      options.campaignIds.push(campaignId);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.write) options.check = true;
  return options;
}

function checkOrWrite({ write = false, campaignIds = SUPPORTED_ITEM_SHELL_CAMPAIGN_IDS } = {}) {
  const errors = [];
  const campaigns = readCollection("campaigns");
  const items = readCollection("items");
  const assets = readCollection("assets");
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const publishedItems = items.filter((item) => item.page?.status === "published");
  let checkedCount = 0;
  let updatedCount = 0;

  for (const campaignId of campaignIds.length > 0 ? campaignIds : SUPPORTED_ITEM_SHELL_CAMPAIGN_IDS) {
    if (!SUPPORTED_ITEM_SHELL_CAMPAIGN_IDS.includes(campaignId)) {
      errors.push(`${campaignId}: item page shell renderer does not support this campaign yet`);
      continue;
    }

    const campaign = campaignById.get(campaignId);
    if (!campaign || campaign.status !== "published") {
      errors.push(`${campaignId}: campaign is missing or not published`);
      continue;
    }

    const relatedItems = relatedItemsForCampaign(campaign, publishedItems);
    for (const item of relatedItems) {
      const asset = (item.assetIds ?? []).map((id) => assetById.get(id)).find(Boolean);
      if (!asset) {
        errors.push(`${campaignId} item page ${item.id}: primary asset is missing`);
        continue;
      }

      const result = processItemPage({ item, campaign, asset, relatedItems, write });
      errors.push(...result.errors);
      if (result.updated) updatedCount += 1;
      checkedCount += 1;
    }
  }

  if (errors.length > 0) {
    console.error("Item page shell checks failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    write
      ? `Item page shell renderer updated ${updatedCount} of ${checkedCount} item pages.`
      : `Item page shell checks passed: ${checkedCount} item pages match JSON-backed shell fragments.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const options = parseArgs(process.argv.slice(2));
    checkOrWrite({ write: options.write, campaignIds: options.campaignIds });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
