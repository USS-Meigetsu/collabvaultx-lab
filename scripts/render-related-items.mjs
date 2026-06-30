#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readCollection, rootDir } from "./lib/data-readers.mjs";
import {
  decodeEntities,
  escapeAttribute,
  escapeText,
  getAttribute,
  normalizeHtml,
  sectionIndent,
  textContent,
} from "./lib/html-utils.mjs";
import { pagePathToHtmlPath, relativeUrl } from "./lib/path-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function campaignRelatedLabel(campaign) {
  const englishLead = String(campaign.displayTitleEn ?? "").match(/^([A-Za-z0-9@&.+-]+)/)?.[1];
  if (englishLead) return englishLead;

  const asciiPartner = (campaign.partnerNames ?? []).find((name) =>
    /^[\x20-\x7e]+$/.test(name) && /[A-Za-z0-9]/.test(name),
  );
  if (asciiPartner) return asciiPartner;

  return campaign.partnerNames?.[0] || campaign.slug || "同一キャンペーン";
}

export function relatedItemsForCampaign(campaign, items = []) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return (campaign.itemIds ?? [])
    .map((id) => itemById.get(id))
    .filter((item) => item?.page?.status === "published");
}

export function renderRelatedItems(item, campaign, relatedItems, options = {}) {
  const indent = options.indent ?? "            ";
  const inner = `${indent}  `;
  const deep = `${indent}    `;
  const itemHtmlPath = pagePathToHtmlPath(item.page.path);
  const heading = `関連する${campaignRelatedLabel(campaign)}商品ページ`;

  const links = relatedItems
    .map((relatedItem) => {
      if (relatedItem.id === item.id) {
        return `${deep}<li><span aria-current="page">${escapeText(relatedItem.officialNameJa)}</span></li>`;
      }

      const relatedHtmlPath = pagePathToHtmlPath(relatedItem.page.path);
      const href = relativeUrl(itemHtmlPath, relatedHtmlPath);
      return `${deep}<li><a href="${escapeAttribute(href)}">${escapeText(relatedItem.officialNameJa)}</a></li>`;
    })
    .join("\n");

  return [
    `${indent}<section class="reference-block" aria-labelledby="related-items-heading">`,
    `${inner}<h3 id="related-items-heading">${escapeText(heading)}</h3>`,
    `${inner}<ul>`,
    links,
    `${inner}</ul>`,
    `${indent}</section>`,
  ].join("\n");
}

export function extractRelatedItemsSection(html) {
  const marker = 'aria-labelledby="related-items-heading"';
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const sectionStart = html.lastIndexOf("<section", markerIndex);
  const sectionEnd = html.indexOf("</section>", markerIndex);
  if (sectionStart === -1 || sectionEnd === -1) return null;

  return {
    html: html.slice(sectionStart, sectionEnd + "</section>".length),
    start: sectionStart,
    end: sectionEnd + "</section>".length,
    indent: sectionIndent(html, sectionStart),
  };
}

export function normalizeRelatedItemsHtml(html) {
  return normalizeHtml(html);
}

function extractListItems(sectionHtml) {
  return [...sectionHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
}

export function validateRelatedItemsStructure({ item, campaign, relatedItems, sectionHtml, itemHtmlPath, label }) {
  const errors = [];
  const listItems = extractListItems(sectionHtml);
  const expectedItems = relatedItems;
  const expectedLabels = expectedItems.map((relatedItem) => relatedItem.officialNameJa);
  const actualLabels = listItems.map((block) => textContent(block));
  const expectedLabelSet = new Set(expectedLabels);

  if (!sectionHtml.includes('id="related-items-heading"')) {
    errors.push(`${label}: related item navigation is missing id="related-items-heading"`);
  }
  if (!expectedItems.some((relatedItem) => relatedItem.id === item.id)) {
    errors.push(`${label}: current item is not present in campaign.itemIds`);
  }
  if (actualLabels.join("|") !== expectedLabels.join("|")) {
    errors.push(
      `${label}: related item order must follow campaign.itemIds (${expectedLabels.join(" | ")})`,
    );
  }

  for (const labelText of actualLabels) {
    if (!expectedLabelSet.has(labelText)) {
      errors.push(`${label}: related navigation has extra or cross-campaign item "${labelText}"`);
    }
  }

  for (const expectedLabel of expectedLabels) {
    const count = actualLabels.filter((actualLabel) => actualLabel === expectedLabel).length;
    if (count !== 1) {
      errors.push(`${label}: related navigation must include "${expectedLabel}" exactly once`);
    }
  }

  const currentBlocks = listItems.filter((block) => /\baria-current=(["'])page\1/.test(block));
  if (currentBlocks.length !== 1) {
    errors.push(`${label}: related navigation must mark exactly one current item`);
  } else if (textContent(currentBlocks[0]) !== item.officialNameJa) {
    errors.push(`${label}: aria-current="page" must be on current item "${item.officialNameJa}"`);
  }

  for (const relatedItem of expectedItems) {
    const block = listItems.find((candidate) => textContent(candidate) === relatedItem.officialNameJa) ?? "";
    const anchorTag = block.match(/<a\b[^>]*>/)?.[0] ?? "";
    const spanTag = block.match(/<span\b[^>]*>/)?.[0] ?? "";

    if (relatedItem.id === item.id) {
      if (anchorTag) {
        errors.push(`${label}: current item "${relatedItem.id}" should be a span, not a link`);
      }
      if (getAttribute(spanTag, "aria-current") !== "page") {
        errors.push(`${label}: current item "${relatedItem.id}" must use aria-current="page"`);
      }
      continue;
    }

    const expectedHref = relativeUrl(itemHtmlPath, pagePathToHtmlPath(relatedItem.page.path));
    if (!anchorTag) {
      errors.push(`${label}: related item "${relatedItem.id}" must be linked`);
      continue;
    }
    if (decodeEntities(getAttribute(anchorTag, "href")) !== expectedHref) {
      errors.push(`${label}: related item "${relatedItem.id}" href must be ${expectedHref}`);
    }
    if (getAttribute(anchorTag, "aria-current") === "page") {
      errors.push(`${label}: non-current item "${relatedItem.id}" must not use aria-current="page"`);
    }
  }

  return errors;
}

function checkOrWrite({ write = false } = {}) {
  const errors = [];
  const campaigns = readCollection("campaigns");
  const items = readCollection("items");
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const publishedItems = items.filter((item) => item.page?.status === "published");
  let updatedCount = 0;
  let checkedCount = 0;

  for (const item of publishedItems) {
    const campaign = campaignById.get(item.campaignId);
    const itemHtmlPath = item.page?.path ? pagePathToHtmlPath(item.page.path) : "";
    const label = `${item.id} related item navigation`;
    if (!campaign || campaign.status !== "published") continue;
    if (!itemHtmlPath) {
      errors.push(`${label}: published item is missing page.path`);
      continue;
    }

    const fullPath = path.join(rootDir, itemHtmlPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`${label}: missing page ${itemHtmlPath}`);
      continue;
    }

    const pageHtml = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
    const section = extractRelatedItemsSection(pageHtml);
    if (!section) {
      errors.push(`${label}: related item navigation section is missing`);
      continue;
    }

    const relatedItems = relatedItemsForCampaign(campaign, publishedItems);
    const expectedHtml = renderRelatedItems(item, campaign, relatedItems, { indent: section.indent });

    if (normalizeRelatedItemsHtml(section.html) !== normalizeRelatedItemsHtml(expectedHtml)) {
      if (write) {
        const nextHtml = `${pageHtml.slice(0, section.start)}${expectedHtml}${pageHtml.slice(section.end)}`;
        fs.writeFileSync(fullPath, nextHtml, "utf8");
        updatedCount += 1;
      } else {
        errors.push(
          ...validateRelatedItemsStructure({
            item,
            campaign,
            relatedItems,
            sectionHtml: section.html,
            itemHtmlPath,
            label,
          }),
        );
        errors.push(`${label}: existing related item navigation does not match renderer output`);
      }
    } else if (!write) {
      errors.push(
        ...validateRelatedItemsStructure({
          item,
          campaign,
          relatedItems,
          sectionHtml: section.html,
          itemHtmlPath,
          label,
        }),
      );
    }

    checkedCount += 1;
  }

  if (errors.length > 0) {
    console.error("Related item renderer checks failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    write
      ? `Related item renderer updated ${updatedCount} of ${checkedCount} related nav sections.`
      : `Related item renderer checks passed: ${checkedCount} related nav sections match JSON.`,
  );
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  const args = new Set(process.argv.slice(2));
  checkOrWrite({ write: args.has("--write") });
}
