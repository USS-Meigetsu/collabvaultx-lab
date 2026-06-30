export function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttribute(value) {
  return escapeText(value).replace(/"/g, "&quot;");
}

export function escapeAltAttribute(value) {
  return String(value ?? "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function textContent(html) {
  return decodeEntities(String(html ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function getAttribute(openingTag, name) {
  const pattern = new RegExp(`${name}=(["'])(.*?)\\1`);
  return openingTag.match(pattern)?.[2] ?? "";
}

export function getOpeningTags(html, tagName) {
  return [...String(html ?? "").matchAll(new RegExp(`<${tagName}\\b[^>]*>`, "g"))].map((match) => match[0]);
}

export function sectionIndent(html, sectionStart) {
  const lineStart = html.lastIndexOf("\n", sectionStart) + 1;
  return html.slice(lineStart, sectionStart).match(/^\s*/)?.[0] ?? "";
}

export function normalizeHtml(html) {
  return String(html ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
