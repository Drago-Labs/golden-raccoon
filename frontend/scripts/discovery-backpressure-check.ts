import assert from "node:assert/strict";
import { isPollDue, createPollCoalescer } from "../src/server/discovery/pollingGuard";
import type { DiscoveryCursor, ProviderPollingConfig } from "../src/server/discovery/types";
async function main() {
  const now = 1000000;
  const config = { freshness: { maxCursorAgeMs: 100, pollIntervalMs: 50 } } as ProviderPollingConfig;
  const cursor = { updatedAt: new Date(now - 1000).toISOString(), nextAllowedPollMs: now + 10, consecutiveFailures: 1 } as DiscoveryCursor;
  assert.equal(isPollDue(cursor, config, now), false, "Staleness must not bypass backoff");
  assert.equal(isPollDue(cursor, config, now + 10), true);
  assert.equal(isPollDue({ ...cursor, updatedAt: new Date(now).toISOString(), nextAllowedPollMs: 0, consecutiveFailures: 0 }, config, now), false);
  assert.equal(isPollDue(null, config, now), true);
  const poll = createPollCoalescer<number>();
  let calls = 0;
  const task = async () => ++calls;
  assert.deepEqual(await Promise.all([poll("stellar:testnet", task), poll("stellar:testnet", task)]), [1, 1]);
  assert.equal(await poll("stellar:pubnet", task), 2);
  await assert.rejects(poll("stellar:testnet", async () => { throw new Error("offline"); }));
  assert.equal(await poll("stellar:testnet", task), 3, "Failure must release the in-flight slot");
  console.log("Discovery backpressure checks passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
