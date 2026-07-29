/**
 * Vitest setup. Points the watchlist persistence layer at a per-process temp
 * directory so tests do not collide with the developer machine's `.data`.
 */
import { afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempRoot = mkdtempSync(join(tmpdir(), "watchlist-tests-"));

process.env.WATCHLIST_DATA_DIR = tempRoot;

afterEach(async () => {
  const { __resetWatchlistPersistenceForTests } = await import("@/server/storage/persistence");

  await __resetWatchlistPersistenceForTests();
});
