import assert from "node:assert/strict";
import { escapeWatchlistCsv, parseWatchlistCsv } from "../src/server/discovery/watchlistCsv";
const notes = ['commas, stay', 'quote "stays"', "two\nlines", "CR\r\nLF", "'apostrophe", "=SUM(A1)", "+formula", "@formula", "\tformula", "  spaced  ", ""];
for (const note of notes) {
  const csv = "version,chain,note\r\n" + ["1.0.0", "ethereum", note].map(escapeWatchlistCsv).join(",");
  assert.deepEqual(parseWatchlistCsv(csv), [{ version: "1.0.0", chain: "ethereum", note }]);
}
assert.deepEqual(parseWatchlistCsv("\uFEFFversion,chain\r\n1.0.0,stellar\r\n"), [{ version: "1.0.0", chain: "stellar" }]);
for (const csv of ['version,chain\n"unterminated,stellar', 'version,chain\n"one"x,stellar', 'version,version\na,b', 'version,__proto__\na,b', 'version,chain\na,b,c']) assert.throws(() => parseWatchlistCsv(csv));
assert.throws(() => parseWatchlistCsv("version,chain\na,b\nc,d", 1));
console.log("Watchlist CSV round-trip checks passed");
