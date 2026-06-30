import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = process.env.COLLABVAULTX_ROOT_DIR
  ? path.resolve(process.env.COLLABVAULTX_ROOT_DIR)
  : path.resolve(__dirname, "..", "..");

export function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/^\uFEFF/, "");
}

export function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

export function readCollection(relativeDir) {
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
