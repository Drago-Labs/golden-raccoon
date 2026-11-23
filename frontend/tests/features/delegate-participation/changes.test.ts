import { describe, expect, it } from "vitest";
import { rankDelegationChanges } from "@/server/research/delegate-participation/delegationChanges";
import { readDelegationEvents } from "@/server/research/delegate-participation/delegationEvents";
import { DELEGATE_LIMITS } from "@/server/research/delegate-participation/limits";
import { DELEGATE_A, DELEGATE_B, DELEGATOR_1, E18, fixture, recordedLogReader, TOKEN } from "./fixtures";

const active = fixture("activeDelegates");

async function events() {
  return readDelegationEvents(recordedLogReader(active), TOKEN, active.range.fromBlock, active.range.toBlock);
}

describe("rankDelegationChanges", () => {
  it("ranks by the size of the power change regardless of direction", async () => {
    const { checkpoints, moves } = await events();
    const ranked = rankDelegationChanges(checkpoints, moves, "https://etherscan.io/tx/", 10);
    // Equal magnitudes break newest first, so the ranking does not depend on provider order.
    expect(ranked.map((change) => [change.delegate, change.blockNumber, change.deltaUnits])).toEqual([
      [DELEGATE_A, 1000, (1000n * E18).toString()],
      [DELEGATE_A, 1500, (500n * E18).toString()],
      [DELEGATE_B, 1100, (500n * E18).toString()],
    ]);
  });

  it("names the delegators whose delegation moved in the same transaction", async () => {
    const { checkpoints, moves } = await events();
    const [largest] = rankDelegationChanges(checkpoints, moves, "https://etherscan.io/tx/", 1);
    expect(largest.delegators).toEqual([DELEGATOR_1]);
    expect(largest.txUrl).toBe(`https://etherscan.io/tx/${largest.txId}`);
  });

  it("says plainly when no delegation event shares the transaction", async () => {
    const { checkpoints } = await events();
    const ranked = rankDelegationChanges(checkpoints, [], "https://etherscan.io/tx/", 10);
    expect(ranked.every((change) => change.delegators.length === 0)).toBe(true);
  });

  it("ranks a power decrease by its magnitude", async () => {
    const { checkpoints, moves } = await events();
    const withExit = [
      ...checkpoints,
      {
        delegate: DELEGATE_B,
        blockNumber: 1900,
        previousPower: (500n * E18).toString(),
        newPower: "0",
        deltaPower: (-500n * E18).toString(),
        txId: `0x${"e".repeat(64)}`,
        logIndex: 0,
      },
    ];
    const ranked = rankDelegationChanges(withExit, moves, "https://etherscan.io/tx/", 10);
    expect(ranked[0].deltaUnits).toBe((1000n * E18).toString());
    expect(ranked.map((change) => change.blockNumber)).toEqual([1000, 1900, 1500, 1100]);
  });

  it("returns only the requested count, within the documented bound", async () => {
    const { checkpoints, moves } = await events();
    expect(rankDelegationChanges(checkpoints, moves, "https://etherscan.io/tx/", 1)).toHaveLength(1);
    const many = Array.from({ length: 40 }, (_, index) => ({
      delegate: DELEGATE_A,
      blockNumber: 1000 + index,
      previousPower: "0",
      newPower: String(index + 1),
      deltaPower: String(index + 1),
      txId: `0x${index.toString(16).padStart(64, "0")}`,
      logIndex: 0,
    }));
    expect(rankDelegationChanges(many, [], "https://etherscan.io/tx/", 999)).toHaveLength(DELEGATE_LIMITS.maxRankedChanges);
    expect(rankDelegationChanges(many, [], "https://etherscan.io/tx/", 0)).toHaveLength(1);
  });

  it("leaves the caller's list untouched", async () => {
    const { checkpoints, moves } = await events();
    const order = checkpoints.map((checkpoint) => checkpoint.blockNumber);
    rankDelegationChanges(checkpoints, moves, "https://etherscan.io/tx/", 10);
    expect(checkpoints.map((checkpoint) => checkpoint.blockNumber)).toEqual(order);
  });
});
