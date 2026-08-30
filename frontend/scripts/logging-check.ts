import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const SEARCH_DIR = path.join(ROOT, "src");

function walk(dir: string, cb: (file: string) => void) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip our logger implementation directory
      if (p.includes(path.join("src", "server", "observability", "logger"))) continue;
      walk(p, cb);
    } else if (entry.isFile() && p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js")) {
      cb(p);
    }
  }
}

const violations: Array<{ file: string; line: number; text: string }> = [];

walk(SEARCH_DIR, (file) => {
  const content = fs.readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("console.")) {
      // Only flag console calls inside server code
      if (file.includes(path.join("src", "server"))) {
        violations.push({ file: path.relative(ROOT, file), line: i + 1, text: lines[i].trim() });
      }
    }
  }
});

if (violations.length > 0) {
  console.error("Found raw console usage in server files:");
  for (const v of violations) {
    console.error(`${v.file}:${v.line}: ${v.text}`);
  }
  process.exit(2);
}

console.log("No raw console usage found in server files.");
