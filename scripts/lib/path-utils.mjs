import fs from "node:fs";
import path from "node:path";
import { readText, rootDir } from "./data-readers.mjs";

export function pagePathToHtmlPath(pagePath) {
  return pagePath.endsWith("/") ? `${pagePath}index.html` : pagePath;
}

function normalizeUrlPath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/\.\//g, "/");
}

export function relativeUrl(fromHtmlPath, targetRepoPath) {
  const fromDir = path.posix.dirname(normalizeUrlPath(fromHtmlPath));
  const target = normalizeUrlPath(targetRepoPath);
  const relative = path.posix.relative(fromDir, target);
  const href = relative === "" ? "." : relative;
  const prefixed = href.startsWith(".") ? href : `./${href}`;
  return prefixed.replace(/^\.(?:\/\.)+\//, "./").replace(/\/\.\//g, "/");
}

export function publicUrlForPath(pagePath) {
  const host = fs.existsSync(path.join(rootDir, "CNAME")) ? readText("CNAME").trim() : "";
  const normalized = pagePath.replace(/^\/+/, "");
  return host ? `https://${host}/${normalized}` : `/${normalized}`;
}
