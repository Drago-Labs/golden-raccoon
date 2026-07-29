/**
 * Disk-backed persistence for watchlist + scan records.
 *
 * The MVP store keeps all other tables in-memory; watchlist entries and their
 * immutable scan records survive process restarts by writing to a JSON file
 * under `frontend/.data/watchlist.json`. The directory is gitignored.
 *
 * Writes are atomic (write to `*.tmp` then `rename`) so partial files never
 * appear on disk. Concurrent writers are expected in single-process MVP only;
 * a Supabase adapter can swap this implementation later without API changes.
 *
 * The loaded shape is cached on `globalThis` so HMR reloads of the persistence
 * module do not lose state, and so synchronous counters (e.g. storage listing
 * statistics) can read the cache without an async hop.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { WatchlistEntry, WatchlistScanRecord } from "@/server/types";

export type WatchlistDiskShape = {
  version: 1;
  entries: WatchlistEntry[];
  scans: WatchlistScanRecord[];
};

const RELATIVE_DATA_DIR = ".data";
const FILE_NAME = "watchlist.json";

type WatchlistCache = {
  __goldenRaccoonWatchlistCache?: WatchlistDiskShape;
  __goldenRaccoonWatchlistWriteChain?: Promise<void>;
};

const cache = globalThis as WatchlistCache;

function resolveDataPath() {
  const override = process.env.WATCHLIST_DATA_DIR || process.env.FRONTEND_PROJECT_ROOT;

  if (override) {
    return resolve(override, RELATIVE_DATA_DIR, FILE_NAME);
  }

  return resolve(process.cwd(), RELATIVE_DATA_DIR, FILE_NAME);
}

async function ensureDir(filePath: string) {
  await mkdir(dirname(filePath), { recursive: true });
}

export async function loadWatchlistFromDisk(): Promise<WatchlistDiskShape> {
  if (cache.__goldenRaccoonWatchlistCache) return cache.__goldenRaccoonWatchlistCache;

  const path = resolveDataPath();

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<WatchlistDiskShape>;

    cache.__goldenRaccoonWatchlistCache = {
      version: 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      scans: Array.isArray(parsed.scans) ? parsed.scans : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      // Corrupt file: start clean rather than crash the process.
      cache.__goldenRaccoonWatchlistCache = { version: 1, entries: [], scans: [] };

      return cache.__goldenRaccoonWatchlistCache;
    }

    cache.__goldenRaccoonWatchlistCache = { version: 1, entries: [], scans: [] };
  }

  return cache.__goldenRaccoonWatchlistCache;
}

async function persistShape(next: WatchlistDiskShape) {
  cache.__goldenRaccoonWatchlistCache = next;

  const path = resolveDataPath();
  const tmpPath = `${path}.tmp`;
  const serialized = JSON.stringify(next, null, 2);

  cache.__goldenRaccoonWatchlistWriteChain = (cache.__goldenRaccoonWatchlistWriteChain ?? Promise.resolve()).then(
    async () => {
      await ensureDir(path);
      await writeFile(tmpPath, serialized, "utf8");
      await rename(tmpPath, path);
    },
  );

  await cache.__goldenRaccoonWatchlistWriteChain;
}

export async function saveWatchlistToDisk(next: WatchlistDiskShape) {
  await persistShape(next);
}

export async function __resetWatchlistPersistenceForTests() {
  cache.__goldenRaccoonWatchlistCache = undefined;
  cache.__goldenRaccoonWatchlistWriteChain = Promise.resolve();

  try {
    const path = resolveDataPath();
    const { unlink } = await import("node:fs/promises");

    await unlink(path).catch(() => undefined);
  } catch {
    // best effort
  }
}

export function __getWatchlistPersistencePath() {
  return resolveDataPath();
}

/**
 * Reads the cached snapshot synchronously. Returns an empty shape if the
 * asynchronous loader has not finished yet. Used for storage counts where the
 * caller cannot await (Next.js route handlers' GET endpoints do not require
 * async, but the watchlist listing does — the count is sampled best-effort).
 */
export function readWatchlistSnapshotSync(): WatchlistDiskShape {
  return cache.__goldenRaccoonWatchlistCache ?? { version: 1, entries: [], scans: [] };
}

export async function mutateWatchlistSnapshot(
  mutator: (current: WatchlistDiskShape) => WatchlistDiskShape,
) {
  const current = await loadWatchlistFromDisk();
  const next = mutator({ ...current, entries: [...current.entries], scans: [...current.scans] });

  await persistShape(next);

  return next;
}
