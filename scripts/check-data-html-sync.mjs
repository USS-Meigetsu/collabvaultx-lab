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

function extractArticle(html, id) {
  const articlePattern = new RegExp(
    `<article\\b(?=[^>]*\\bid=(["'])${id}\\1)[^>]*>[\\s\\S]*?<\\/article>`,
  );
  const article = html.match(articlePattern)?.[0];
  if (!article) return null;

  const openingTag = article.match(/^<article\b[^>]*>/)?.[0] ?? "";
  return { html: article, openingTag };
}

function extractCardMeta(articleHtml) {
  const meta = {};
  const pairPattern = /<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g;
  for (const match of articleHtml.matchAll(pairPattern)) {
    meta[textContent(match[1])] = textContent(match[2]);
  }
  return meta;
}

function extractPrimaryLink(articleHtml) {
  const link = articleHtml.match(/<a\b[^>]*data-collab-slug=["'][^"']+["'][^>]*>/)?.[0];
  return link ?? "";
}

const campaign = readJson("data/campaigns/lawson-cinderellagray-campaign-202511.json");
const html = readText("works/umamusume/index.html");
const card = extractArticle(html, "collab-lawson-cinderellagray-campaign");

if (!card) {
  fail("Lawson campaign card is missing from works/umamusume/index.html");
} else {
  const label = "works/umamusume/index.html#collab-lawson-cinderellagray-campaign";
  const status = getAttribute(card.openingTag, "data-status");
  const categories = getAttribute(card.openingTag, "data-category")
    .split(/\s+/)
    .filter(Boolean);
  const searchKeywords = getAttribute(card.openingTag, "data-search-keywords");
  const categorySet = new Set(categories);
  const meta = extractCardMeta(card.html);
  const primaryLink = extractPrimaryLink(card.html);
  const href = decodeEntities(getAttribute(primaryLink, "href"));
  const dataSlug = getAttribute(primaryLink, "data-collab-slug");

  if (status !== "published") {
    fail(`${label}: data-status must be published`);
  }

  if (searchKeywords.trim() === "") {
    fail(`${label}: data-search-keywords must not be empty`);
  }

  for (const category of campaign.categories ?? []) {
    if (!categorySet.has(category)) {
      fail(`${label}: data-category is missing "${category}" from campaign JSON`);
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

  if (dataSlug !== campaign.slug) {
    fail(`${label}: data-collab-slug "${dataSlug}" does not match campaign.slug "${campaign.slug}"`);
  }

  if (!href.includes(`/collabs/${campaign.slug}/`) && !href.includes(`./collabs/${campaign.slug}/`)) {
    fail(`${label}: href "${href}" does not point to campaign slug "${campaign.slug}"`);
  }
}

if (errors.length > 0) {
  console.error("Data/HTML sync checks failed:");
  for (const message of errors) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("Data/HTML sync checks passed: Lawson campaign card matches pilot JSON.");
