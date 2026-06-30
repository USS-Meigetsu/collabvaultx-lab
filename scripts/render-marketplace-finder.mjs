#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.COLLABVAULTX_ROOT_DIR
  ? path.resolve(process.env.COLLABVAULTX_ROOT_DIR)
  : path.resolve(__dirname, "..");

export const MARKETPLACE_FINDER_GROUPS = [
  { id: "overview", titleJa: "まず全体を探す" },
  { id: "sets", titleJa: "セットで探す" },
  { id: "single-item", titleJa: "単品・対象品で探す" },
  { id: "jp-marketplaces", titleJa: "日本マーケットを巡回" },
  { id: "price-check", titleJa: "相場確認" },
  { id: "other", titleJa: "その他の検索" },
];

export const ALLOWED_MARKETPLACE_FINDER_GROUPS = new Set(
  MARKETPLACE_FINDER_GROUPS.map((group) => group.id),
);

const GROUP_TITLE_BY_ID = new Map(MARKETPLACE_FINDER_GROUPS.map((group) => [group.id, group.titleJa]));

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

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

function regionLabel(region) {
  if (region === "global") return "Global";
  if (region === "jp") return "JP";
  if (region === "us") return "US";
  return region ? String(region).toUpperCase() : "Reference";
}

function sectionIndent(html, sectionStart) {
  const lineStart = html.lastIndexOf("\n", sectionStart) + 1;
  return html.slice(lineStart, sectionStart).match(/^\s*/)?.[0] ?? "            ";
}

export function marketplaceFinderGroupKeys(searches = []) {
  const keys = [];
  for (const search of searches) {
    if (typeof search.finderGroup !== "string" || keys.includes(search.finderGroup)) continue;
    keys.push(search.finderGroup);
  }
  return MARKETPLACE_FINDER_GROUPS.map((group) => group.id).filter((id) => keys.includes(id));
}

export function groupedMarketplaceSearches(searches = []) {
  const searchesByGroup = new Map();
  for (const search of searches) {
    if (!search.finderGroup) continue;
    const groupSearches = searchesByGroup.get(search.finderGroup) ?? [];
    groupSearches.push(search);
    searchesByGroup.set(search.finderGroup, groupSearches);
  }

  return MARKETPLACE_FINDER_GROUPS
    .map((group) => ({
      ...group,
      searches: searchesByGroup.get(group.id) ?? [],
    }))
    .filter((group) => group.searches.length > 0);
}

export function renderMarketplaceFinder(item, options = {}) {
  const indent = options.indent ?? "            ";
  const inner = `${indent}  `;
  const deep = `${indent}    `;
  const deeper = `${indent}      `;
  const deepest = `${indent}        `;
  const groups = groupedMarketplaceSearches(item.marketplaceSearches ?? []);

  const groupBlocks = groups
    .map((group) => {
      const links = group.searches
        .map((search) => {
          const meta = `${regionLabel(search.region)} / ${search.queryLabel ?? search.query}`;
          return [
            `${deepest}<li>`,
            `${deepest}  <a`,
            `${deepest}    class="marketplace-link"`,
            `${deepest}    data-marketplace-id="${escapeAttribute(search.id)}"`,
            `${deepest}    href="${escapeAttribute(search.affiliateUrl && search.isAffiliate ? search.affiliateUrl : search.url)}"`,
            `${deepest}    target="_blank"`,
            `${deepest}    rel="${escapeAttribute(search.rel)}"`,
            `${deepest}  >`,
            `${deepest}    <span>${escapeText(search.labelJa)}</span>`,
            `${deepest}    <span class="marketplace-link-meta">${escapeText(meta)}</span>`,
            `${deepest}  </a>`,
            `${deepest}</li>`,
          ].join("\n");
        })
        .join("\n");

      return [
        `${deep}<article class="marketplace-group" data-marketplace-group="${escapeAttribute(group.id)}">`,
        `${deeper}<h4 class="marketplace-group-title">${escapeText(group.titleJa)}</h4>`,
        `${deeper}<ul class="marketplace-link-list">`,
        links,
        `${deeper}</ul>`,
        `${deep}</article>`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `${indent}<section`,
    `${inner}class="reference-block marketplace-finder"`,
    `${inner}aria-labelledby="marketplace-finder-heading"`,
    `${inner}data-marketplace-finder="${escapeAttribute(item.id)}"`,
    `${indent}>`,
    `${inner}<div class="marketplace-finder-heading">`,
    `${deep}<div>`,
    `${deeper}<p class="section-label">Marketplace Finder</p>`,
    `${deeper}<h3 id="marketplace-finder-heading">二次流通の参考検索</h3>`,
    `${deep}</div>`,
    `${deep}<p class="marketplace-finder-note" lang="en">`,
    `${deeper}Reference searches only. Links do not confirm stock, price, authenticity, or seller reliability.`,
    `${deep}</p>`,
    `${inner}</div>`,
    "",
    `${inner}<div class="marketplace-finder-grid">`,
    groupBlocks,
    `${inner}</div>`,
    "",
    `${inner}<p class="marketplace-affiliate-note" lang="en">`,
    `${deep}These are non-affiliate reference links as of the checked date. If affiliate links are added later, they must be visibly disclosed.`,
    `${inner}</p>`,
    `${indent}</section>`,
  ].join("\n");
}

export function extractMarketplaceFinderSection(html) {
  const marker = 'aria-labelledby="marketplace-finder-heading"';
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

export function normalizeMarketplaceFinderHtml(html) {
  return String(html ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function validateGroups(item, actualHtml, errors, label) {
  const articleTags = [...actualHtml.matchAll(/<article\b[^>]*class=(["'])[^"']*\bmarketplace-group\b[^"']*\1[^>]*>/g)].map(
    (match) => match[0],
  );
  const actualGroups = articleTags.map((tag) => tag.match(/\bdata-marketplace-group=(["'])(.*?)\1/)?.[2] ?? "");
  const expectedGroups = marketplaceFinderGroupKeys(item.marketplaceSearches ?? []);

  if (articleTags.some((tag) => /\bdata-marketplace-intent=/.test(tag))) {
    errors.push(`${label}: Marketplace Finder groups should use data-marketplace-group, not data-marketplace-intent`);
  }
  for (const group of actualGroups) {
    if (!ALLOWED_MARKETPLACE_FINDER_GROUPS.has(group)) {
      errors.push(`${label}: Marketplace Finder has unknown group "${group}"`);
    }
  }
  if (actualGroups.join(",") !== expectedGroups.join(",")) {
    errors.push(
      `${label}: Marketplace Finder group order "${actualGroups.join(",")}" must match JSON finderGroup order "${expectedGroups.join(",")}"`,
    );
  }

  for (const group of expectedGroups) {
    const title = GROUP_TITLE_BY_ID.get(group);
    if (title && !actualHtml.includes(title)) {
      errors.push(`${label}: Marketplace Finder group "${group}" is missing title "${title}"`);
    }
  }
}

function checkOrWrite({ write = false } = {}) {
  const errors = [];
  const items = readCollection("items");
  let updatedCount = 0;
  let checkedCount = 0;

  for (const item of items.filter((candidate) => candidate.marketplaceFinder?.status === "published")) {
    const itemPath = item.page?.path ? pagePathToHtmlPath(item.page.path) : "";
    const label = `${item.id} Marketplace Finder`;
    if (!itemPath) {
      errors.push(`${label}: published Finder item is missing page.path`);
      continue;
    }

    const fullPath = path.join(rootDir, itemPath);
    if (!fs.existsSync(fullPath)) {
      errors.push(`${label}: missing page ${itemPath}`);
      continue;
    }

    const pageHtml = fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, "");
    const section = extractMarketplaceFinderSection(pageHtml);
    if (!section) {
      errors.push(`${label}: Marketplace Finder section is missing`);
      continue;
    }

    const expectedHtml = renderMarketplaceFinder(item, { indent: section.indent });

    if (normalizeMarketplaceFinderHtml(section.html) !== normalizeMarketplaceFinderHtml(expectedHtml)) {
      if (write) {
        const nextHtml = `${pageHtml.slice(0, section.start)}${expectedHtml}${pageHtml.slice(section.end)}`;
        fs.writeFileSync(fullPath, nextHtml, "utf8");
        updatedCount += 1;
      } else {
        validateGroups(item, section.html, errors, label);
        errors.push(`${label}: existing Marketplace Finder does not match renderer output`);
      }
    } else if (!write) {
      validateGroups(item, section.html, errors, label);
    }

    checkedCount += 1;
  }

  if (errors.length > 0) {
    console.error("Marketplace Finder renderer checks failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    write
      ? `Marketplace Finder renderer updated ${updatedCount} of ${checkedCount} Finder sections.`
      : `Marketplace Finder renderer checks passed: ${checkedCount} Finder sections match JSON.`,
  );
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  const args = new Set(process.argv.slice(2));
  checkOrWrite({ write: args.has("--write") });
}
