import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const data = join(dirname(fileURLToPath(import.meta.url)), "data");

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(data, name), "utf8")) as unknown;
}
