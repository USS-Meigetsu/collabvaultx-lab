#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function extractArticle(html, id) {
  const articlePattern = new RegExp(
    `<article\\b(?=[^>]*\\bid=(["'])${id}\\1)[^>]*>[\\s\\S]*?<\\/article>`,
  );
  const article = html.match(articlePattern)?.[0];
  if (!article) return null;

  const openingTag = article.match(/^<article\b[^>]*>/)?.[0] ?? "";
  return { html: article, openingTag };
}

function extractProductCardContaining(html, text) {
  const articlePattern = /<article\b(?=[^>]*class=["'][^"']*\bproduct-card\b)[^>]*>[\s\S]*?<\/article>/g;
  for (const match of html.matchAll(articlePattern)) {
    if (textContent(match[0]).includes(text)) {
      return match[0];
    }
  }
  return null;
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

const campaign = readJson("data/campaigns/lawson-cinderellagray-campaign-202511.json");
const items = readJson("data/items/lawson-cinderellagray-campaign-202511.json");
const sources = readJson("data/sources/lawson-cinderellagray-campaign-202511.json");
const assets = readJson("data/assets/lawson-cinderellagray-campaign-202511.json");
const html = readText("works/umamusume/index.html");
const card = extractArticle(html, "collab-lawson-cinderellagray-campaign");
const itemMap = new Map(items.map((item) => [item.id, item]));
const sourceMap = new Map(sources.map((source) => [source.id, source]));
const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

if (!card) {
  fail("Lawson campaign card is missing from works/umamusume/index.html");
} else {
  const label = "works/umamusume/index.html#collab-lawson-cinderellagray-campaign";
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

function validatePublishedItemPage({ itemId, sourceId, assetId }) {
  const item = itemMap.get(itemId);
  const label = `Lawson item page ${itemId}`;

  if (!item) {
    fail(`data/items/lawson-cinderellagray-campaign-202511.json: missing ${itemId} item`);
    return;
  }

  const itemPage = item.page;
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
  const parentHtmlPath = `works/umamusume/collabs/${campaign.slug}/index.html`;
  const parentHtml = readText(parentHtmlPath);
  const sitemap = readText("sitemap.xml");
  const source = item.sourceIds
    .map((id) => sourceMap.get(id))
    .find((candidate) => candidate?.id === sourceId);
  const asset = item.assetIds
    .map((id) => assetMap.get(id))
    .find((candidate) => candidate?.id === assetId);

  if (getCanonicalUrl(itemHtml) !== itemPublicUrl) {
    fail(`${label}: canonical URL does not match ${itemPublicUrl}`);
  }
  if (getMetaContent(itemHtml, "og:url") !== itemPublicUrl) {
    fail(`${label}: og:url does not match ${itemPublicUrl}`);
  }
  if (!sitemap.includes(`<loc>${itemPublicUrl}</loc>`)) {
    fail(`${label}: sitemap.xml is missing ${itemPublicUrl}`);
  }

  const productCard = extractProductCardContaining(parentHtml, item.officialNameJa);
  if (!productCard) {
    fail(`${label}: parent Lawson page is missing product card for ${item.officialNameJa}`);
  } else {
    const expectedParentHref = relativeUrl(parentHtmlPath, itemHtmlPath);
    const alternateParentHref = expectedParentHref.replace(/^\.\//, "");
    const cardLinks = getOpeningTags(productCard, "a").map((tag) => decodeEntities(getAttribute(tag, "href")));
    if (!cardLinks.includes(expectedParentHref) && !cardLinks.includes(alternateParentHref)) {
      fail(`${label}: parent product card is missing link to ${expectedParentHref}`);
    }
  }

  assertTextIncludes(itemPageText, item.officialNameJa, label);
  assertTextIncludes(itemPageText, item.summaryEn, label);
  assertTextIncludes(itemPageText, item.lineupLabelJa, label);
  assertTextIncludes(itemPageText, item.priceLabel, label);
  assertTextIncludes(itemPageText, item.acquisitionMethodJa, label);
  assertTextIncludes(itemPageText, item.availabilityLabel, label);

  if (!source) {
    fail(`${label}: ${sourceId} source is missing from sourceIds`);
  } else if (!itemHtml.includes(source.url)) {
    fail(`${label}: item page is missing source URL ${source.url}`);
  }

  for (const search of item.marketplaceSearches ?? []) {
    if (!itemHtml.includes(search.url)) {
      fail(`${label}: item page is missing marketplace URL for ${search.platform}`);
    }
  }

  if (!asset) {
    fail(`${label}: ${assetId} asset is missing from assetIds`);
  } else {
    const expectedImageSrc = relativeUrl(itemHtmlPath, asset.path);
    const productImageMatches = [
      ...itemHtml.matchAll(/<div\s+class=["']product-thumb["']>\s*<img\b([^>]*)>/g),
    ];
    const productImage = productImageMatches
      .map((match) => match[1])
      .find((attributes) => decodeEntities(getAttribute(attributes, "src")) === expectedImageSrc);

    if (!productImage) {
      fail(`${label}: product image src must match ${expectedImageSrc}`);
    } else {
      if (getAttribute(productImage, "loading") !== "lazy") {
        fail(`${label}: product image must use loading="lazy"`);
      }
      if (getAttribute(productImage, "decoding") !== "async") {
        fail(`${label}: product image must use decoding="async"`);
      }
      if (decodeEntities(getAttribute(productImage, "alt")) !== asset.altJa) {
        fail(`${label}: product image alt must match asset.altJa`);
      }
    }
  }
}

for (const itemConfig of [
  {
    itemId: "lawson-clear-files",
    sourceId: "lawson-clear-file",
    assetId: "lawson-clear-file-main",
  },
  {
    itemId: "lawson-galbo-series",
    sourceId: "lawson-food",
    assetId: "lawson-galbo-main",
  },
]) {
  validatePublishedItemPage(itemConfig);
}

if (errors.length > 0) {
  console.error("Data/HTML sync checks failed:");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("Data/HTML sync checks passed: Lawson campaign card and published item pages match pilot JSON.");
