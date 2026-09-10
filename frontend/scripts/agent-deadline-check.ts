import assert from "node:assert/strict";
import { createRunDeadline, withinAgentDeadline, AgentDeadlineError } from "../src/server/agents/deadline";
async function main() {
  let started = 0;
  await assert.rejects(withinAgentDeadline(performance.now() - 1, 100, async () => ++started), AgentDeadlineError);
  assert.equal(started, 0);
  let signal: AbortSignal | undefined;
  const deadline = createRunDeadline(20);
  await assert.rejects(withinAgentDeadline(deadline, 1000, async (s, remaining) => {
    signal = s; assert.ok(remaining <= 20); return new Promise<never>(() => {});
  }), AgentDeadlineError);
  assert.equal(signal?.aborted, true);
  await assert.rejects(withinAgentDeadline(deadline, 1000, async () => ++started), AgentDeadlineError);
  assert.equal(started, 0);
  assert.equal(await withinAgentDeadline(createRunDeadline(), 12000, async () => 42), 42);
  await assert.rejects(withinAgentDeadline(createRunDeadline(), 12000, async () => { throw new Error("provider failed"); }), /provider failed/);
  assert.throws(() => createRunDeadline(NaN), RangeError);
  console.log("Agent deadline checks passed (no pending 12-second timers)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
