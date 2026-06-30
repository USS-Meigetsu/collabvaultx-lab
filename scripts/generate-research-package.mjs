#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { rootDir } from "./lib/data-readers.mjs";
import { escapeAltAttribute, escapeAttribute, escapeText } from "./lib/html-utils.mjs";
import { pagePathToHtmlPath, publicUrlForPath, relativeUrl } from "./lib/path-utils.mjs";
import { renderCampaignProductGrid } from "./render-campaign-product-grid.mjs";
import { renderMarketplaceFinder } from "./render-marketplace-finder.mjs";
import { relatedItemsForCampaign, renderRelatedItems } from "./render-related-items.mjs";
import {
  expectedItemPageMetadata,
  renderBackLinks,
  renderBreadcrumbs,
  renderHeroMedia,
} from "./render-item-page-shell.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function writeText(relativePath, content) {
  const fullPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

function writeJson(relativePath, value) {
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function collection(relativeDir) {
  const dir = path.join(rootDir, "data", relativeDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => {
      const parsed = readJson(path.posix.join("data", relativeDir, name));
      return Array.isArray(parsed) ? parsed : [parsed];
    });
}

function validatePackage(packagePath) {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "validate-research-package.mjs"), packagePath],
    { cwd: rootDir, encoding: "utf8" },
  );
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Research package validation failed: ${packagePath}`);
  }
}

function normalizeFactList(item) {
  const facts = Array.isArray(item.productGrid?.factsJa) ? [...item.productGrid.factsJa] : [];
  for (const value of [item.lineupLabelJa, officialListedPriceLabel(item), item.acquisitionMethodJa]) {
    if (typeof value === "string" && value.trim() !== "" && !facts.includes(value)) {
      facts.push(value);
    }
  }
  return facts;
}

function normalizeFieldEvidenceRefs(entry) {
  const next = { ...entry };
  if (!next.fieldEvidenceRefs && next.factEvidenceRefs) {
    next.fieldEvidenceRefs = next.factEvidenceRefs;
  }
  delete next.factEvidenceRefs;
  return next;
}

function officialListedPriceLabel(item) {
  if (typeof item.priceLabel !== "string" || item.priceLabel.trim() === "") return "";
  if (item.priceLabel.includes("公式掲載価格") || item.priceLabel.includes("当時")) return item.priceLabel;
  return `当時の公式掲載価格: ${item.priceLabel}`;
}

function dataItemFromPackage(item, campaign) {
  const next = normalizeFieldEvidenceRefs(item);
  const pageDecision = item.pageDecision;
  delete next.pageDecision;

  next.productGrid = {
    ...(next.productGrid ?? {}),
    factsJa: normalizeFactList(item),
  };

  if (pageDecision?.decision === "generate") {
    next.page = {
      status: "published",
      slug: pageDecision.slug,
      path: `works/${campaign.workId}/collabs/${campaign.slug}/items/${pageDecision.slug}/`,
    };
    next.marketplaceFinder = { status: "published" };
  } else {
    delete next.page;
    delete next.marketplaceFinder;
  }

  return next;
}

function dataAssetFromPackage(asset) {
  const { id, role, sourceId, remoteUrl, localPath, altJa, usage, downloadPolicy, rightsNote, ...metadata } = asset;
  return {
    id,
    path: localPath,
    role,
    altJa,
    sourceId,
    loading: role === "hero" ? "eager" : "lazy",
    decoding: role === "hero" ? undefined : "async",
    remoteUrl,
    usage,
    rightsNote,
    ...metadata,
  };
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefined(entry)]),
    );
  }
  return value;
}

function isCompositeAsset(asset) {
  if (!asset) return false;
  if (asset.imageKind === "composite") return true;
  return [asset.id, asset.path, asset.usage, asset.altJa].filter(Boolean).join(" ").toLowerCase().includes("composite");
}

function buildImageReviewQueue({ items, assets }) {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const usageByPrimaryAsset = new Map();
  const queue = [];

  for (const item of items) {
    const assetId = (item.assetIds ?? []).find((id) => assetsById.has(id));
    if (!assetId) continue;
    if (!usageByPrimaryAsset.has(assetId)) usageByPrimaryAsset.set(assetId, []);
    usageByPrimaryAsset.get(assetId).push(item.id);

    if (["needs-image-pass", "needs-human-review"].includes(item.productGrid?.imageReviewStatus)) {
      queue.push({
        type: "product-card-image-review",
        itemId: item.id,
        assetId,
        status: item.productGrid.imageReviewStatus,
        priority: item.productGrid.imageImprovementPriority ?? "official-individual",
        note: item.productGrid.imageNotes ?? "",
      });
    }
  }

  for (const asset of assets) {
    if (["needs-image-pass", "needs-human-review"].includes(asset.imageReviewStatus)) {
      queue.push({
        type: "asset-image-review",
        assetId: asset.id,
        status: asset.imageReviewStatus,
        priority: asset.imageImprovementPriority ?? "official-individual",
        representedItemIds: asset.representedItemIds ?? [],
        note: asset.imageNotes ?? "",
      });
    }
  }

  for (const [assetId, itemIds] of usageByPrimaryAsset.entries()) {
    const asset = assetsById.get(assetId);
    if (itemIds.length < 2 || !isCompositeAsset(asset)) continue;
    queue.push({
      type: "reused-composite-product-card-image",
      assetId,
      itemIds,
      status: "needs-image-pass",
      priority: asset?.imageImprovementPriority ?? "official-individual",
      note: "Initial generation may use this composite as a provisional visual, but final product cards need item-specific images or reviewed reference candidates.",
    });
  }

  return queue;
}

async function downloadAssets(assets) {
  for (const asset of assets) {
    if (!asset.remoteUrl) continue;
    const fullPath = path.join(rootDir, asset.localPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (fs.existsSync(fullPath)) continue;

    const response = await fetch(asset.remoteUrl);
    if (!response.ok) {
      throw new Error(`Failed to download ${asset.remoteUrl}: ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(fullPath, bytes);
  }
}

function headHtml({ title, description, canonical, ogType, ogTitle, ogDescription, ogUrl, ogImage, ogImageAlt, cssHref }) {
  return `    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeText(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}" />
    <link rel="canonical" href="${escapeAttribute(canonical)}" />
    <meta property="og:site_name" content="CollabVaultX" />
    <meta property="og:type" content="${escapeAttribute(ogType)}" />
    <meta property="og:title" content="${escapeAttribute(ogTitle)}" />
    <meta property="og:description" content="${escapeAttribute(ogDescription)}" />
    <meta property="og:url" content="${escapeAttribute(ogUrl)}" />
    <meta property="og:image" content="${escapeAttribute(ogImage)}" />
    <meta property="og:image:alt" content="${escapeAttribute(ogImageAlt)}" />
    <meta name="twitter:title" content="${escapeAttribute(ogTitle)}" />
    <meta name="twitter:description" content="${escapeAttribute(ogDescription)}" />
    <meta name="twitter:image" content="${escapeAttribute(ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#07090d" />
    <link rel="stylesheet" href="${escapeAttribute(cssHref)}" />`;
}

function sourceListHtml(sources, htmlPath, indent = "                ") {
  return sources
    .map((source) => {
      return [
        `${indent}<li>`,
        `${indent}  Official source: <a href="${escapeAttribute(source.url)}" target="_blank" rel="noopener noreferrer">${escapeText(source.label)}</a>`,
        `${indent}  <span>Checked date: ${escapeText(source.checkedAt)} / ${escapeText(source.type)}</span>`,
        `${indent}  <span>Notes: ${escapeText(source.scope ?? "Source-backed archive reference.")}</span>`,
        `${indent}</li>`,
      ].join("\n");
    })
    .join("\n");
}

function publicVerificationListHtml(notes, scope, indent = "                ") {
  const publicNotes = (Array.isArray(notes) ? notes : []).filter((note) => {
    return note.scope === scope || note.scope === "all-public-pages";
  });
  if (publicNotes.length === 0) {
    return `${indent}<li>No public verification notes recorded.</li>`;
  }

  return publicNotes.map((note) => `${indent}<li>${escapeText(note.note)}</li>`).join("\n");
}

function generatedMarker(pkg, packagePath) {
  const source = packagePath.replace(/\\/g, "/");
  return `<!-- Generated by CollabVaultX from ${escapeText(source)} packageId=${escapeText(pkg.packageId)}. Do not hand-edit generated regions. -->`;
}

function renderCampaignPage({ pkg, packagePath, campaign, work, assetsById, itemsById, sourcesById }) {
  const pagePath = `works/${campaign.workId}/collabs/${campaign.slug}/`;
  const htmlPath = pagePathToHtmlPath(pagePath);
  const heroAsset = assetsById.get(campaign.heroAssetId);
  const cssHref = relativeUrl(htmlPath, "assets/css/style.css");
  const heroSrc = relativeUrl(htmlPath, heroAsset.path);
  const publicUrl = publicUrlForPath(pagePath);
  const ogImage = publicUrlForPath(heroAsset.path);
  const sourceList = (campaign.sourceIds ?? []).map((id) => sourcesById.get(id)).filter(Boolean);
  const productGrid = renderCampaignProductGrid(campaign, itemsById, assetsById, { indent: "        " });

  return `<!doctype html>
${generatedMarker(pkg, packagePath)}
<html lang="ja">
  <head>
${headHtml({
  title: `${campaign.officialTitleJa} | ${work.officialNameJa} | CollabVaultX`,
  description: campaign.summaryEn,
  canonical: publicUrl,
  ogType: "article",
  ogTitle: `${campaign.officialTitleJa} | CollabVaultX`,
  ogDescription: campaign.summaryEn,
  ogUrl: publicUrl,
  ogImage,
  ogImageAlt: heroAsset.altJa,
  cssHref,
})}
  </head>
  <body>
    <div class="page-shell">
      <header class="subpage-hero subpage-hero-collab-entry">
        <picture class="subpage-hero-collab-media" aria-hidden="true">
          <img src="${escapeAttribute(heroSrc)}" alt="" loading="eager" fetchpriority="high" decoding="async" />
        </picture>
        <a class="subpage-hero-collab-link" href="${escapeAttribute(heroSrc)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttribute(`${campaign.officialTitleJa} hero image`)}"></a>
        <div class="subpage-hero-content subpage-hero-content-wide">
          <nav class="breadcrumb-links" aria-label="Breadcrumbs">
            <a class="back-link" href="${escapeAttribute(relativeUrl(htmlPath, "index.html"))}">← Top page</a>
            <a class="back-link" href="${escapeAttribute(relativeUrl(htmlPath, `works/${work.slug}/index.html`))}">← ${escapeText(work.officialNameJa)}</a>
          </nav>
          <h1>${escapeText(campaign.officialTitleJa)}</h1>
          <p class="hero-copy">${escapeText(campaign.summaryJa ?? campaign.summaryEn)}</p>
          <p class="hero-english-summary" lang="en">English summary: ${escapeText(campaign.summaryEn)}</p>
          <p class="hero-subcopy">${escapeText(campaign.periodLabel)} / ${escapeText((campaign.partnerNames ?? []).join(" / "))}</p>
          <div class="hero-meta-stack" aria-label="Campaign metadata">
            <p class="hero-meta-line">${escapeText(campaign.cardMeta?.items ?? "")}</p>
            <p class="hero-meta-line">${escapeText(campaign.coverageNote ?? "")}</p>
          </div>
        </div>
      </header>

      <main>
        <section class="overview-panel" aria-labelledby="overview-heading">
          <div class="section-heading section-heading-simple">
            <div>
              <p class="section-label">Overview</p>
              <h2 id="overview-heading">コラボ概要</h2>
            </div>
          </div>
          <div class="overview-grid overview-grid-two">
            <article class="overview-card">
              <p class="card-tag">Schedule</p>
              <h3>受注販売期間</h3>
              <ul>
                <li>${escapeText(campaign.periodLabel)}</li>
                <li>${escapeText(campaign.startDate ?? "")} - ${escapeText(campaign.endDate ?? "")}</li>
                <li>${escapeText(campaign.endCondition ?? "")}</li>
              </ul>
            </article>
            <article class="overview-card">
              <p class="card-tag">Coverage</p>
              <h3>記録範囲</h3>
              <ul>
                <li>${escapeText(campaign.cardMeta?.items ?? "")}</li>
                <li>${escapeText(campaign.coverageNote ?? "Source-backed campaign and item groups.")}</li>
              </ul>
            </article>
          </div>
        </section>

        <section class="section-heading section-heading-with-meta">
          <div>
            <p class="section-label">Items</p>
            <h2>関連アイテム一覧</h2>
            <p class="section-copy">${escapeText(campaign.summaryEn)}</p>
            <p class="market-note">
              <span lang="en">Secondary-market search links in item details are reference searches only. Availability, price, and authenticity are not verified by CollabVaultX.</span><br />
              二次流通の検索リンクは参考検索です。在庫・価格・真贋はCollabVaultXでは確認していません。
            </p>
          </div>
        </section>

${productGrid}

        <section class="reference-section" aria-labelledby="reference-heading">
          <div class="section-heading section-heading-simple">
            <div>
              <p class="section-label">Reference</p>
              <h2 id="reference-heading">参照元とレビュー情報</h2>
            </div>
          </div>
          <div class="reference-panel">
            <section class="reference-block" aria-labelledby="source-heading">
              <h3 id="source-heading">公式・準公式ソース</h3>
              <ul>
${sourceListHtml(sourceList, htmlPath)}
              </ul>
            </section>
            <section class="reference-block" aria-labelledby="verification-heading">
              <h3 id="verification-heading">公開検証メモ</h3>
              <ul>
${publicVerificationListHtml(pkg.publicVerificationNotes, "campaign-page")}
              </ul>
            </section>
            <section class="reference-block" aria-labelledby="asset-note-heading">
              <h3 id="asset-note-heading">画像利用メモ</h3>
              <p>
                <span lang="en">Images are archive thumbnails for identification. Rights remain with each rights holder, and source attribution does not imply permission, partnership, or endorsement.</span><br />
                画像は識別目的のアーカイブ用サムネイルです。権利は各権利者に帰属し、出典表記は許諾・提携・推奨を意味しません。
              </p>
            </section>
          </div>
        </section>
      </main>
    </div>
  </body>
</html>
`;
}

function factListHtml(item, indent = "                ") {
  const facts = [item.lineupLabelJa, officialListedPriceLabel(item), item.acquisitionMethodJa, item.availabilityLabel]
    .filter((value) => typeof value === "string" && value.trim() !== "");
  return facts.map((fact) => `${indent}<span>${escapeText(fact)}</span>`).join("\n");
}

function subItemsHtml(item, indent = "                ") {
  if (!Array.isArray(item.subItems) || item.subItems.length === 0) return "";
  return [
    `${indent}<h3>内訳</h3>`,
    `${indent}<ul>`,
    ...item.subItems.map((subItem) => {
      const bits = [subItem.officialNameJa, subItem.lineupLabelJa, subItem.priceLabel].filter(Boolean);
      return `${indent}  <li>${escapeText(bits.join(" / "))}</li>`;
    }),
    `${indent}</ul>`,
  ].join("\n");
}

function renderItemPage({ pkg, packagePath, item, campaign, work, asset, sourceList, relatedItems }) {
  const htmlPath = pagePathToHtmlPath(item.page.path);
  const cssHref = relativeUrl(htmlPath, "assets/css/style.css");
  const metadata = expectedItemPageMetadata(item, campaign, asset);
  const productImageSrc = relativeUrl(htmlPath, asset.path);

  return `<!doctype html>
${generatedMarker(pkg, packagePath)}
<html lang="ja">
  <head>
${headHtml({
  title: metadata.title,
  description: metadata.description,
  canonical: metadata.canonical,
  ogType: metadata.ogType,
  ogTitle: metadata.ogTitle,
  ogDescription: metadata.ogDescription,
  ogUrl: metadata.ogUrl,
  ogImage: metadata.ogImage,
  ogImageAlt: metadata.ogImageAlt,
  cssHref,
})}
  </head>
  <body>
    <div class="page-shell">
      <header class="subpage-hero subpage-hero-collab-entry">
${renderHeroMedia(item, asset, { indent: "        " })}
        <div class="subpage-hero-content subpage-hero-content-wide">
${renderBreadcrumbs(item, campaign, { indent: "          " })}
          <h1>${escapeText(item.officialNameJa)}</h1>
          <p class="hero-copy">${escapeText(item.descriptionJa)}</p>
          <p class="hero-english-summary" lang="en">English summary: ${escapeText(item.summaryEn)}</p>
          <p class="hero-subcopy">${escapeText(item.lineupLabelJa ?? "")} / ${escapeText(officialListedPriceLabel(item))}</p>
          <div class="hero-meta-stack" aria-label="Item metadata">
            <p class="hero-meta-line">入手方法: ${escapeText(item.acquisitionMethodJa)}</p>
            <p class="hero-meta-line">期間: ${escapeText(item.availabilityLabel ?? "")}</p>
          </div>
        </div>
      </header>

      <main>
        <section class="overview-panel" aria-labelledby="overview-heading">
          <div class="section-heading section-heading-simple">
            <div>
              <p class="section-label">Item Group</p>
              <h2 id="overview-heading">商品グループ概要</h2>
            </div>
          </div>
          <div class="overview-grid">
            <article class="overview-card">
              <p class="card-tag">Acquisition</p>
              <h3>入手方法</h3>
              <ul>
                <li>${escapeText(item.acquisitionMethodJa)}</li>
                <li>${escapeText(item.availabilityLabel ?? "")}</li>
              </ul>
            </article>
            <article class="overview-card">
              <p class="card-tag">Lineup</p>
              <h3>ラインナップ</h3>
              <ul>
                <li>${escapeText(item.lineupLabelJa ?? "")}</li>
                <li>${escapeText(officialListedPriceLabel(item))}</li>
              </ul>
            </article>
          </div>
        </section>

        <section class="product-grid product-grid-catalog" aria-label="${escapeAttribute(`${item.officialNameJa} product details`)}">
          <article class="product-card product-card-wide" data-item-id="${escapeAttribute(item.id)}">
            <div class="product-thumb">
              <img loading="lazy" decoding="async" src="${escapeAttribute(productImageSrc)}" alt="${escapeAltAttribute(asset.altJa)}" />
            </div>
            <div class="product-card-body">
              <p class="card-tag">${escapeText(item.productGrid?.tag ?? item.category)}</p>
              <h3>${escapeText(item.officialNameJa)}</h3>
              <p>${escapeText(item.descriptionJa)}</p>
              <details class="product-details" open>
                <summary>記録項目</summary>
                <div class="item-fact-list">
${factListHtml(item)}
                </div>
${subItemsHtml(item)}
              </details>
            </div>
          </article>
        </section>

        <section class="reference-section" aria-labelledby="reference-heading">
          <div class="section-heading section-heading-simple">
            <div>
              <p class="section-label">References</p>
              <h2 id="reference-heading">参照元・検索メモ</h2>
            </div>
          </div>
          <div class="reference-panel">
            <p class="reference-lede">
              このページは、公式・準公式ソースで確認できる商品名、入手方法、価格、期間を記録したアーカイブです。
            </p>
            <p class="market-note">
              <span lang="en">Secondary-market search links on this page are reference searches only. Availability, price, and authenticity are not verified by CollabVaultX.</span><br />
              二次流通の検索リンクは参考検索です。在庫・価格・真贋はCollabVaultXでは確認していません。
            </p>

            <section class="reference-block" aria-labelledby="official-source-heading">
              <h3 id="official-source-heading">公式・準公式ソース</h3>
              <ul>
${sourceListHtml(sourceList, htmlPath)}
              </ul>
            </section>

            <section class="reference-block" aria-labelledby="archive-note-heading">
              <h3 id="archive-note-heading">アーカイブ注記</h3>
              <p>
                <span lang="en">Images are archive thumbnails for identification. Rights remain with each rights holder, and source attribution does not imply permission, partnership, or endorsement.</span><br />
                画像は識別目的のアーカイブ用サムネイルです。権利は各権利者に帰属し、出典表記は許諾・提携・推奨を意味しません。
              </p>
            </section>

${renderMarketplaceFinder(item, { indent: "            " })}

${renderRelatedItems(item, campaign, relatedItems, { indent: "            " })}

${renderBackLinks(item, campaign, { indent: "            " })}
          </div>
        </section>
      </main>
    </div>
  </body>
</html>
`;
}

function renderCollabCard({ campaign, work, heroAsset }) {
  const href = `./collabs/${campaign.slug}/index.html`;
  const imageSrc = relativeUrl(`works/${work.slug}/index.html`, heroAsset.path);
  const keywords = [...(campaign.searchKeywords ?? []), ...(campaign.partnerNames ?? []), campaign.displayTitleEn]
    .filter(Boolean)
    .join(" ");
  const partner = String(campaign.partnerNames?.[0] ?? campaign.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || campaign.slug;

  return `          <article
            class="collab-card collab-card-rich"
            id="collab-${escapeAttribute(campaign.slug)}"
            data-status="published"
            data-partner="${escapeAttribute(partner)}"
            data-category="${escapeAttribute((campaign.categories ?? []).join(" "))}"
            data-search-keywords="${escapeAttribute(keywords)}"
          >
            <a class="collab-thumb collab-thumb-link" href="${escapeAttribute(href)}" data-collab-slug="${escapeAttribute(campaign.slug)}" aria-label="${escapeAttribute(`${campaign.officialTitleJa}の詳細へ移動`)}">
              <img src="${escapeAttribute(imageSrc)}" alt="${escapeAltAttribute(`${campaign.officialTitleJa}のサムネイル`)}" />
            </a>
            <div class="collab-card-body">
              <p class="card-tag">${escapeText(campaign.cardMeta?.period ?? campaign.periodLabel)} / ${escapeText(campaign.partnerNames?.[0] ?? "")}</p>
              <dl class="card-meta-list" aria-label="Archive metadata">
                <div>
                  <dt>Period</dt>
                  <dd>${escapeText(campaign.cardMeta?.period ?? "")}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>${escapeText(campaign.cardMeta?.source ?? "")}</dd>
                </div>
                <div>
                  <dt>Items</dt>
                  <dd>${escapeText(campaign.cardMeta?.items ?? "")}</dd>
                </div>
              </dl>
              <h3><a class="card-title-link" href="${escapeAttribute(href)}" data-collab-slug="${escapeAttribute(campaign.slug)}">${escapeText(campaign.officialTitleJa)}</a></h3>
              <p>${escapeText(campaign.summaryJa ?? campaign.summaryEn)}</p>
              <p class="english-summary" lang="en">${escapeText(campaign.summaryEn)}</p>
              <a class="card-button" href="${escapeAttribute(href)}" data-collab-slug="${escapeAttribute(campaign.slug)}">詳細を見る</a>
            </div>
          </article>`;
}

function updateWorkIndex({ campaign, work, heroAsset }) {
  const indexPath = `works/${work.slug}/index.html`;
  let html = fs.readFileSync(path.join(rootDir, indexPath), "utf8");
  if (html.includes(`data-collab-slug="${campaign.slug}"`)) return;

  const partnerValue = String(campaign.partnerNames?.[0] ?? campaign.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || campaign.slug;
  if (!html.includes(`data-filter-value="${partnerValue}"`)) {
    html = html.replace(
      /(\s+<button type="button" class="filter-chip" data-filter-value="round1" aria-pressed="false">ROUND1<\/button>)/,
      `$1\n                <button type="button" class="filter-chip" data-filter-value="${partnerValue}" aria-pressed="false">${escapeText(campaign.partnerNames?.[0] ?? campaign.displayTitleEn)}</button>`,
    );
  }

  html = html.replace(/公開済み \d+ \/ \d+ 件/, (match) => {
    const numbers = match.match(/\d+/g)?.map(Number) ?? [0, 0];
    return `公開済み ${numbers[0] + 1} / ${numbers[1] + 1} 件`;
  });

  const marker = "\n        </section>\n        <p class=\"filter-empty\"";
  const card = `\n${renderCollabCard({ campaign, work, heroAsset })}\n`;
  if (!html.includes(marker)) {
    throw new Error(`${indexPath}: could not find collab-grid insertion marker`);
  }
  html = html.replace(marker, `${card}${marker}`);
  writeText(indexPath, html);
}

function updateSitemap({ pkg, campaign, work, generatedItems }) {
  const sitemapPath = "sitemap.xml";
  let xml = fs.readFileSync(path.join(rootDir, sitemapPath), "utf8");
  const entries = [
    { url: publicUrlForPath(`works/${work.slug}/collabs/${campaign.slug}/`), priority: "0.8" },
    ...generatedItems.map((item) => ({ url: publicUrlForPath(item.page.path), priority: "0.7" })),
  ];
  const lastmod = pkg.createdAt;
  const blocks = entries
    .filter((entry) => !xml.includes(`<loc>${entry.url}</loc>`))
    .map((entry) => `  <url>
    <loc>${entry.url}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${entry.priority}</priority>
  </url>`)
    .join("\n");
  if (!blocks) return;
  xml = xml.replace("</urlset>", `${blocks}\n</urlset>`);
  writeText(sitemapPath, xml);
}

function importData(pkg) {
  const campaign = stripUndefined(normalizeFieldEvidenceRefs(pkg.campaign));
  const items = pkg.items.map((item) => stripUndefined(dataItemFromPackage(item, campaign)));
  const assets = pkg.assets.map((asset) => stripUndefined(dataAssetFromPackage(asset)));

  writeJson(`data/campaigns/${campaign.id}.json`, campaign);
  writeJson(`data/sources/${campaign.id}.json`, pkg.sources);
  writeJson(`data/assets/${campaign.id}.json`, assets);
  writeJson(`data/items/${campaign.id}.json`, items);

  return { campaign, items, assets, sources: pkg.sources };
}

function buildImportReport({ pkg, packagePath, campaign, items, assets, sources, generatedItems }) {
  return {
    reportVersion: "0.1",
    packageId: pkg.packageId,
    packagePath: packagePath.replace(/\\/g, "/"),
    importedFiles: [
      `data/campaigns/${campaign.id}.json`,
      `data/sources/${campaign.id}.json`,
      `data/assets/${campaign.id}.json`,
      `data/items/${campaign.id}.json`,
      pagePathToHtmlPath(`works/${campaign.workId}/collabs/${campaign.slug}/`),
      ...generatedItems.map((item) => pagePathToHtmlPath(item.page.path)),
    ],
    counts: {
      sources: sources.length,
      assets: assets.length,
      items: items.length,
      generatedItemPages: generatedItems.length,
      parentCardOnlyItems: pkg.items.filter((item) => item.pageDecision?.decision === "parent-card-only").length,
      deferredItems: pkg.items.filter((item) => item.pageDecision?.decision === "defer").length,
    },
    generatedRoutes: {
      campaignPage: `works/${campaign.workId}/collabs/${campaign.slug}/`,
      itemPages: generatedItems.map((item) => item.page.path),
    },
    skippedItems: pkg.items
      .filter((item) => item.pageDecision?.decision !== "generate")
      .map((item) => ({
        id: item.id,
        decision: item.pageDecision?.decision ?? "unknown",
        reason: item.pageDecision?.reason ?? "",
      })),
    normalizedFields: [
      "factEvidenceRefs renamed to fieldEvidenceRefs in imported data when present.",
      "pageDecision removed from data items after generating page paths.",
      "priceLabel rendered publicly as an original official listed price label.",
      "unresolvedQuestions kept out of public HTML; publicVerificationNotes rendered instead.",
      "image review metadata preserved on assets for the post-generation image pass.",
    ],
    reviewOnlyQuestions: pkg.unresolvedQuestions.map((question) => ({
      id: question.id,
      impact: question.impact,
      publishBlocking: question.publishBlocking,
      question: question.question,
    })),
    imageReviewQueue: buildImageReviewQueue({ items, assets }),
  };
}

function parseArgs(argv) {
  const options = { write: false, downloadAssets: false };
  for (const arg of argv) {
    if (arg === "--write") options.write = true;
    else if (arg === "--download-assets") options.downloadAssets = true;
    else if (!options.packagePath) options.packagePath = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.packagePath) throw new Error("Usage: node scripts/generate-research-package.mjs <package.json> --write [--download-assets]");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.write) {
    throw new Error("This generator currently requires --write so generated files are explicit.");
  }

  validatePackage(options.packagePath);
  const pkg = readJson(options.packagePath.replace(/\\/g, "/"));
  const work = pkg.work;
  const { campaign, items, assets, sources } = importData(pkg);

  if (options.downloadAssets) {
    await downloadAssets(pkg.assets);
  }

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const heroAsset = assetsById.get(campaign.heroAssetId);
  if (!heroAsset) throw new Error(`${campaign.id}: heroAssetId does not resolve`);

  writeText(
    pagePathToHtmlPath(`works/${campaign.workId}/collabs/${campaign.slug}/`),
    renderCampaignPage({ pkg, packagePath: options.packagePath, campaign, work, assetsById, itemsById, sourcesById }),
  );

  const generatedItems = items.filter((item) => item.page?.status === "published");
  const relatedItems = relatedItemsForCampaign(campaign, items);
  for (const item of generatedItems) {
    const asset = (item.assetIds ?? []).map((id) => assetsById.get(id)).find(Boolean);
    if (!asset) throw new Error(`${item.id}: primary asset is missing`);
    const sourceList = item.sourceIds.map((id) => sourcesById.get(id)).filter(Boolean);
    writeText(
      pagePathToHtmlPath(item.page.path),
      renderItemPage({ pkg, packagePath: options.packagePath, item, campaign, work, asset, sourceList, relatedItems }),
    );
  }

  updateWorkIndex({ campaign, work, heroAsset });
  updateSitemap({ pkg, campaign, work, generatedItems });
  writeJson(
    `research-packages/import-reports/${pkg.packageId}.json`,
    buildImportReport({ pkg, packagePath: options.packagePath, campaign, items, assets, sources, generatedItems }),
  );
  console.log(`Generated ${campaign.id}: 1 campaign page, ${generatedItems.length} item pages, ${items.length} item records.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
