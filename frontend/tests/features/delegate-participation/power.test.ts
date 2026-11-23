import { describe, expect, it } from "vitest";
import { DELEGATION_TOPICS, readDelegationEvents } from "@/server/research/delegate-participation/delegationEvents";
import { DelegateParticipationError } from "@/server/research/delegate-participation/errors";
import { normalizeAddress, resolveGovernance, resolveRange } from "@/server/research/delegate-participation/governanceInput";
import { buildPowerSeries, currentPower, formatSeries, peakPower, powerAt } from "@/server/research/delegate-participation/powerSeries";
import { delegateParticipationRequestSchema } from "@/server/research/delegate-participation/schema";
import {
  DELEGATE_A,
  DELEGATE_B,
  DELEGATOR_1,
  DELEGATOR_3,
  E18,
  fixture,
  GOVERNOR,
  participationRequest,
  recordedLogReader,
  TOKEN,
} from "./fixtures";

const active = fixture("activeDelegates");

async function delegationEvents() {
  return readDelegationEvents(recordedLogReader(active), TOKEN, active.range.fromBlock, active.range.toBlock);
}

describe("governanceInput", () => {
  it("lower-cases addresses so one account has one identity", () => {
    expect(normalizeAddress(TOKEN.toUpperCase().replace("0X", "0x"), "token")).toBe(TOKEN);
    expect(() => normalizeAddress("0x123", "token")).toThrowError(/not a usable token/);
  });

  it("resolves a configured chain and refuses an unknown one", () => {
    const identity = resolveGovernance({ chain: "ethereum", tokenAddress: TOKEN, governorAddress: GOVERNOR, delegates: [DELEGATE_A] });
    expect(identity).toMatchObject({ chain: "ethereum", chainId: 1, explorerTxUrl: "https://etherscan.io/tx/" });
    expect(() => resolveGovernance({ chain: "solana", tokenAddress: TOKEN, governorAddress: GOVERNOR, delegates: [] })).toThrowError(
      /not a configured EVM network/,
    );
  });

  it("refuses the same contract as both token and governor, and a repeated delegate", () => {
    expect(() => resolveGovernance({ chain: "ethereum", tokenAddress: TOKEN, governorAddress: TOKEN, delegates: [] })).toThrowError(
      /cannot be the same contract/,
    );
    expect(() =>
      resolveGovernance({ chain: "ethereum", tokenAddress: TOKEN, governorAddress: GOVERNOR, delegates: [DELEGATE_A, DELEGATE_A.toUpperCase().replace("0X", "0x")] }),
    ).toThrowError(/only once/);
  });

  it("resolves a block range and says whether it reaches the chain's start", () => {
    expect(resolveRange(2000, 900, 2000)).toEqual({ fromBlock: 900, toBlock: 2000, coversHistory: false });
    expect(resolveRange(2000, 0, 2000)).toEqual({ fromBlock: 0, toBlock: 2000, coversHistory: true });
    expect(resolveRange(2000).fromBlock).toBe(0);
    expect(resolveRange(1_000_000).fromBlock).toBe(500_001);
  });

  it("refuses a reversed or over-long range and an unusable head", () => {
    expect(() => resolveRange(2000, 1500, 1000)).toThrowError(/start at or before/);
    expect(() => resolveRange(2_000_000, 0, 1_000_000)).toThrowError(/at most 500000 blocks/);
    expect(() => resolveRange(-1)).toThrowError(/usable latest block/);
  });

  it("validates the request shape", () => {
    expect(delegateParticipationRequestSchema.safeParse(participationRequest("activeDelegates")).success).toBe(true);
    expect(delegateParticipationRequestSchema.safeParse(participationRequest("activeDelegates", { tokenAddress: "0x1" })).success).toBe(false);
    expect(
      delegateParticipationRequestSchema.safeParse(participationRequest("activeDelegates", { fromBlock: 2000, toBlock: 900 })).success,
    ).toBe(false);
    expect(delegateParticipationRequestSchema.parse(participationRequest("activeDelegates", { topChanges: undefined })).topChanges).toBe(10);
  });
});

describe("readDelegationEvents", () => {
  it("derives its topics from the event signatures", () => {
    expect(DELEGATION_TOPICS.delegateVotesChanged).toMatch(/^0x[0-9a-f]{64}$/);
    expect(DELEGATION_TOPICS.delegateChanged).not.toBe(DELEGATION_TOPICS.delegateVotesChanged);
  });

  it("reads each delegate's power after every change, and who moved it", async () => {
    const { checkpoints, moves, truncated } = await delegationEvents();
    expect(truncated).toBe(false);
    expect(checkpoints.map((checkpoint) => [checkpoint.delegate, checkpoint.blockNumber, checkpoint.newPower, checkpoint.deltaPower])).toEqual([
      [DELEGATE_A, 1000, (1000n * E18).toString(), (1000n * E18).toString()],
      [DELEGATE_B, 1100, (500n * E18).toString(), (500n * E18).toString()],
      [DELEGATE_A, 1500, (1500n * E18).toString(), (500n * E18).toString()],
    ]);
    expect(moves.map((move) => [move.delegator, move.toDelegate, move.blockNumber])).toEqual([
      [DELEGATOR_1, DELEGATE_A, 1000],
      ["0x2222000000000000000000000000000000000022", DELEGATE_B, 1100],
      [DELEGATOR_3, DELEGATE_A, 1500],
    ]);
  });

  it("refuses a log it cannot decode rather than guessing a power", async () => {
    const broken = fixture("activeDelegates");
    broken.logs = broken.logs
      .filter((log) => log.topics?.[0] === DELEGATION_TOPICS.delegateVotesChanged)
      .map((log) => ({ ...log, data: "0x1234" }));
    await expect(readDelegationEvents(recordedLogReader(broken), TOKEN, 900, 2000)).rejects.toThrowError(
      DelegateParticipationError,
    );
  });
});

describe("powerSeries", () => {
  it("rebuilds each delegate's series from the token's own checkpoints", async () => {
    const { checkpoints } = await delegationEvents();
    const series = buildPowerSeries(checkpoints);
    expect([...series.keys()].sort()).toEqual([DELEGATE_A, DELEGATE_B]);
    expect(series.get(DELEGATE_A)!.checkpoints.map((checkpoint) => checkpoint.blockNumber)).toEqual([1000, 1500]);
  });

  it("matches the fixture checkpoints at, before and after each change", async () => {
    const series = buildPowerSeries((await delegationEvents()).checkpoints).get(DELEGATE_A);
    expect(powerAt(series, 1000, false)).toBe(1000n * E18);
    expect(powerAt(series, 1499, false)).toBe(1000n * E18);
    expect(powerAt(series, 1500, false)).toBe(1500n * E18);
    expect(powerAt(series, 2000, false)).toBe(1500n * E18);
    // Before the first in-range checkpoint the chain itself states the previous
    // balance, so the power then is known rather than assumed.
    expect(powerAt(series, 999, false)).toBe(0n);
  });

  it("reports an unknown power for a delegate with no checkpoint, unless the range covers history", async () => {
    const series = buildPowerSeries((await delegationEvents()).checkpoints);
    expect(powerAt(series.get("0xdddd0000000000000000000000000000000000d3"), 1200, false)).toBeNull();
    expect(powerAt(series.get("0xdddd0000000000000000000000000000000000d3"), 1200, true)).toBe(0n);
  });

  it("states power at the end of the range and the peak held in it", async () => {
    const series = buildPowerSeries((await delegationEvents()).checkpoints);
    expect(currentPower(series.get(DELEGATE_A), 2000, false)).toBe(1500n * E18);
    expect(peakPower(series.get(DELEGATE_A))).toBe(1500n * E18);
    expect(peakPower(series.get(DELEGATE_B))).toBe(500n * E18);
    expect(peakPower(undefined)).toBeNull();
  });

  it("keeps each checkpoint's own transaction link", async () => {
    const series = buildPowerSeries((await delegationEvents()).checkpoints);
    const formatted = formatSeries(series.get(DELEGATE_A), "https://etherscan.io/tx/");
    expect(formatted[0].txUrl).toBe(`https://etherscan.io/tx/${formatted[0].txId}`);
    expect(formatted.map((point) => point.powerUnits)).toEqual([(1000n * E18).toString(), (1500n * E18).toString()]);
  });
});
