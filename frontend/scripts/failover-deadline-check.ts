import assert from "node:assert/strict";
import { executeWithFallback } from "../src/lib/stellar/failover";
async function main() {
  let calls = 0;
  let signal: AbortSignal | undefined;
  await assert.rejects(executeWithFallback(["https://one.test", "https://two.test"], async (_url, _index, _id, attemptSignal) => {
    calls++; signal = attemptSignal;
    return new Promise<never>(() => {});
  }, { totalTimeoutMs: 20 }), AggregateError);
  assert.equal(calls, 1, "A timed-out request must not start another full timeout");
  assert.equal(signal?.aborted, true);
  const result = await executeWithFallback(["https://one.test", "https://two.test"], async (_url, index) => {
    if (index === 0) throw new Error("offline");
    return 42;
  }, { totalTimeoutMs: 100 });
  assert.equal(result.value, 42);
  assert.equal(result.attempts.length, 2);
  for (const freshnessMs of [NaN, Infinity, -1, undefined, 101]) {
    await assert.rejects(executeWithFallback(["https://one.test"], async () => ({ freshnessMs }), { maxFreshnessMs: 100, inspect: value => value }));
  }
  for (const totalTimeoutMs of [0, -1, NaN, Infinity]) {
    await assert.rejects(executeWithFallback(["https://one.test"], async () => 1, { totalTimeoutMs }), RangeError);
  }
  console.log("Failover deadline checks passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
