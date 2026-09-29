import { createReadClient } from "../dist/client.js";
export async function loadWatchlist(origin: string, signal: AbortSignal) {
  const client = createReadClient({ baseUrl: origin, credentials: "same-origin" });
  const result = await client.watchlist.list({}, { signal });
  return result.entries.map(({ identityKey, symbol }) => ({ identityKey, symbol }));
}
