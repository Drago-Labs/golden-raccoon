import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "public", "manifest.webmanifest"), "utf8"));
const sw = readFileSync(join(root, "src", "sw", "serviceWorker.ts"), "utf8");
const strategies = readFileSync(join(root, "src", "sw", "strategies.ts"), "utf8");

for (const field of ["name", "short_name", "start_url", "display", "theme_color", "icons"]) {
  if (!manifest[field]) throw new Error(`manifest missing ${field}`);
}

if (!Array.isArray(manifest.icons) || manifest.icons.length < 2) {
  throw new Error("manifest needs installable icons");
}

if (!sw.includes("caches.delete")) throw new Error("service worker must delete superseded caches");
if (!strategies.includes('url.pathname.startsWith("/api/")')) throw new Error("API responses must stay network-only");
if (!strategies.includes("/offline")) throw new Error("offline fallback route missing");

console.log("offline installability checks passed");
