import fs from "node:fs";
import path from "node:path";
import { readText, rootDir } from "./data-readers.mjs";

export function pagePathToHtmlPath(pagePath) {
  return pagePath.endsWith("/") ? `${pagePath}index.html` : pagePath;
}

export function relativeUrl(fromHtmlPath, targetRepoPath) {
  const fromDir = path.posix.dirname(fromHtmlPath.replace(/\\/g, "/"));
  const target = targetRepoPath.replace(/\\/g, "/");
  const relative = path.posix.relative(fromDir, target);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

export function publicUrlForPath(pagePath) {
  const host = fs.existsSync(path.join(rootDir, "CNAME")) ? readText("CNAME").trim() : "";
  const normalized = pagePath.replace(/^\/+/, "");
  return host ? `https://${host}/${normalized}` : `/${normalized}`;
}
