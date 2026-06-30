#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readCollection, rootDir } from "./lib/data-readers.mjs";
import { escapeAltAttribute, escapeAttribute, escapeText, normalizeHtml } from "./lib/html-utils.mjs";
import { pagePathToHtmlPath, relativeUrl } from "./lib/path-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SUPPORTED_CAMPAIGN_IDS = [
  "round1-collab-campaign-202510",
  "lawson-cinderellagray-campaign-202511",
  "cocos-umaimono-fes-202601",
];

const DEFAULT_CAMPAIGN_IDS = SUPPORTED_CAMPAIGN_IDS;
const PRODUCT_GRID_CLASS_BY_CAMPAIGN_ID = new Map([
  ["lawson-cinderellagray-campaign-202511", "product-grid product-grid-catalog"],
  ["cocos-umaimono-fes-202601", "product-grid product-grid-catalog"],
]);
const MARKET_LINK_PLATFORM_ORDER = ["ebay", "mercari", "suruga-ya"];
const MARKET_LINK_LABEL_BY_PLATFORM = new Map([
  ["ebay", "eBay"],
  ["mercari", "メルカリ"],
  ["suruga-ya", "駿河屋"],
]);

function unique(values) {
  const seen = new Set();
  return values.filter((value) => {
    if (typeof value !== "string" || value.trim() === "" || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function cardTagForItem(item) {
  if (typeof item.productGrid?.tag === "string" && item.productGrid.tag.trim() !== "") {
    return item.productGrid.tag;
  }

  if (item.category === "prize" || item.distributionType === "crane-prize") return "Prize";
  return "Goods";
}

function factLabelsForItem(item) {
  if (Array.isArray(item.productGrid?.factsJa) && item.productGrid.factsJa.length > 0) {
    return unique(item.productGrid.factsJa);
  }

  return unique([
    item.lineupLabelJa,
    item.priceLabel,
    item.acquisitionMethodJa,
    item.availabilityLabel,
  ]);
}

function cardDescriptionForItem(item) {
  if (typeof item.productGrid?.descriptionJa === "string" && item.productGrid.descriptionJa.trim() !== "") {
    return item.productGrid.descriptionJa;
  }

  return item.descriptionJa;
}

function renderProductCardOpeningTag(item, indent) {
  const cardId =
    typeof item.productGrid?.cardId === "string" && item.productGrid.cardId.trim() !== ""
      ? ` id="${escapeAttribute(item.productGrid.cardId)}"`
      : "";
  return `${indent}<article class="product-card"${cardId} data-item-id="${escapeAttribute(item.id)}">`;
}

function curatedMarketLinks(item) {
  const searches = item.marketplaceSearches ?? [];
  const links = [];
  for (const platform of MARKET_LINK_PLATFORM_ORDER) {
    const search = searches.find((candidate) => candidate.platform === platform);
    if (search) links.push(search);
  }
  return links;
}

function productGridSectionClass(campaign) {
  return PRODUCT_GRID_CLASS_BY_CAMPAIGN_ID.get(campaign.id) ?? "product-grid";
}

function renderImage(item, campaignHtmlPath, asset, indent, inner, linked) {
  const src = relativeUrl(campaignHtmlPath, asset.path);
  const img = `<img loading="lazy" decoding="async" src="${escapeAttribute(src)}" alt="${escapeAltAttribute(asset.altJa)}" />`;
  if (!linked) return `${inner}${img}`;

  const itemHtmlPath = pagePathToHtmlPath(item.page.path);
  const href = relativeUrl(campaignHtmlPath, itemHtmlPath);
  return [
    `${inner}<a class="product-thumb-link" href="${escapeAttribute(href)}">`,
    `${inner}  ${img}`,
    `${inner}</a>`,
  ].join("\n");
}

function renderTitle(item, campaignHtmlPath) {
  if (item.page?.status !== "published") return escapeText(item.officialNameJa);

  const itemHtmlPath = pagePathToHtmlPath(item.page.path);
  const href = relativeUrl(campaignHtmlPath, itemHtmlPath);
  return `<a class="product-title-link" href="${escapeAttribute(href)}">${escapeText(item.officialNameJa)}</a>`;
}

function renderMarketLinks(item, indent) {
  const links = curatedMarketLinks(item);
  if (links.length === 0) return [];

  const inner = `${indent}  `;
  return [
    `${indent}<div class="market-links">`,
    ...links.map((search) => {
      const label = MARKET_LINK_LABEL_BY_PLATFORM.get(search.platform) ?? search.labelJa ?? search.labelEn;
      return `${inner}<a href="${escapeAttribute(search.url)}" target="_blank" rel="${escapeAttribute(search.rel)}">${escapeText(label)}</a>`;
    }),
    `${indent}</div>`,
  ];
}

export function renderCampaignProductGrid(campaign, itemsById, assetsById, options = {}) {
  const indent = options.indent ?? "        ";
  const inner = `${indent}  `;
  const deep = `${indent}    `;
  const deeper = `${indent}      `;
  const campaignHtmlPath = pagePathToHtmlPath(`works/${campaign.workId}/collabs/${campaign.slug}/`);
  const cards = [];

  for (const itemId of campaign.itemIds ?? []) {
    const item = itemsById.get(itemId);
    if (!item) continue;

    const asset = (item.assetIds ?? []).map((id) => assetsById.get(id)).find(Boolean);
    if (!asset) continue;

    const isLinked = item.page?.status === "published";
    const factLabels = factLabelsForItem(item);
    const marketLines = renderMarketLinks(item, `${deeper}  `);

    cards.push(
      [
        renderProductCardOpeningTag(item, inner),
        `${deep}<div class="product-thumb">`,
        renderImage(item, campaignHtmlPath, asset, deep, deeper, isLinked),
        `${deep}</div>`,
        `${deep}<div class="product-card-body">`,
        `${deeper}<p class="card-tag">${escapeText(cardTagForItem(item))}</p>`,
        `${deeper}<h3>${renderTitle(item, campaignHtmlPath)}</h3>`,
        `${deeper}<p>${escapeText(cardDescriptionForItem(item))}</p>`,
        `${deeper}<details class="product-details">`,
        `${deeper}  <summary>詳細を見る</summary>`,
        `${deeper}  <div class="item-fact-list">`,
        ...factLabels.map((label) => `${deeper}    <span>${escapeText(label)}</span>`),
        `${deeper}  </div>`,
        ...marketLines,
        `${deeper}</details>`,
        `${deep}</div>`,
        `${inner}</article>`,
      ].join("\n"),
    );
  }

  return [
    `${indent}<section class="${escapeAttribute(productGridSectionClass(campaign))}" aria-label="関連アイテム一覧">`,
    cards.join("\n\n"),
    `${indent}</section>`,
  ].join("\n");
}

export function extractCampaignProductGridSection(html) {
  const marker = 'aria-label="関連アイテム一覧"';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const sectionStart = html.lastIndexOf("<section", markerIndex);
  const sectionEnd = html.indexOf("</section>", markerIndex);
  if (sectionStart === -1 || sectionEnd === -1) return null;
  const sectionLineStart = html.lastIndexOf("\n", sectionStart) + 1;

  return {
    html: html.slice(sectionLineStart, sectionEnd + "</section>".length),
    start: sectionLineStart,
    end: sectionEnd + "</section>".length,
    indent: html.slice(sectionLineStart, sectionStart).match(/^\s*/)?.[0] ?? "",
  };
}

export function normalizeCampaignProductGridHtml(html) {
  return normalizeHtml(html);
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

function checkOrWrite({ write = false, campaignIds = DEFAULT_CAMPAIGN_IDS } = {}) {
  const errors = [];
  const campaigns = readCollection("campaigns");
  const items = readCollection("items");
  const assets = readCollection("assets");
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  let checkedCount = 0;
  let updatedCount = 0;

  for (const campaignId of campaignIds.length > 0 ? campaignIds : DEFAULT_CAMPAIGN_IDS) {
    const campaign = campaignById.get(campaignId);
    const label = `${campaignId} campaign product grid`;
    if (!campaign || campaign.status !== "published") {
      errors.push(`${label}: campaign is missing or not published`);
      continue;
    }

    const campaignHtmlPath = pagePathToHtmlPath(`works/${campaign.workId}/collabs/${campaign.slug}/`);
    const fullPath = path.join(rootDir, campaignHtmlPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`${label}: missing campaign page ${campaignHtmlPath}`);
      continue;
    }

    const pageHtml = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
    const section = extractCampaignProductGridSection(pageHtml);
    if (!section) {
      errors.push(`${label}: product-grid section is missing`);
      continue;
    }

    const expectedHtml = renderCampaignProductGrid(campaign, itemsById, assetsById, {
      indent: section.indent,
    });

    if (normalizeCampaignProductGridHtml(section.html) !== normalizeCampaignProductGridHtml(expectedHtml)) {
      if (write) {
        const nextHtml = `${pageHtml.slice(0, section.start)}${expectedHtml}${pageHtml.slice(section.end)}`;
        fs.writeFileSync(fullPath, nextHtml, "utf8");
        updatedCount += 1;
      } else {
        errors.push(`${label}: existing product grid does not match renderer output`);
      }
    }

    checkedCount += 1;
  }

  if (errors.length > 0) {
    console.error("Campaign product grid renderer checks failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    write
      ? `Campaign product grid renderer updated ${updatedCount} of ${checkedCount} campaign grids.`
      : `Campaign product grid renderer checks passed: ${checkedCount} campaign grids match JSON.`,
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
