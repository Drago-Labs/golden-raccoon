import { describe, expect, it } from "vitest";
import { delegateNotes, reportCoverage } from "@/server/research/delegate-participation/coverage";
import { readDelegationEvents } from "@/server/research/delegate-participation/delegationEvents";
import { largestDelegates, measureParticipation } from "@/server/research/delegate-participation/participation";
import { buildPowerSeries } from "@/server/research/delegate-participation/powerSeries";
import { closedByEndOfRange, proposalsInRange, settledProposals } from "@/server/research/delegate-participation/proposalWindows";
import { GOVERNOR_TOPICS, readGovernorActivity } from "@/server/research/delegate-participation/voteReader";
import {
  DELEGATE_A,
  DELEGATE_B,
  DORMANT,
  E18,
  fixture,
  GOVERNOR,
  recordedCodeReader,
  recordedLogReader,
  TOKEN,
} from "./fixtures";

const active = fixture("activeDelegates");
const range = { fromBlock: active.range.fromBlock, toBlock: active.range.toBlock, coversHistory: false };

async function readAll(name: Parameters<typeof fixture>[0] = "activeDelegates") {
  const data = fixture(name);
  const read = recordedLogReader(data);
  const delegation = await readDelegationEvents(read, TOKEN, data.range.fromBlock, data.range.toBlock);
  const governor = await readGovernorActivity(
    read,
    recordedCodeReader(data),
    GOVERNOR,
    "https://etherscan.io/tx/",
    data.range.fromBlock,
    data.range.toBlock,
  );
  return { delegation, governor, series: buildPowerSeries(delegation.checkpoints) };
}

describe("readGovernorActivity", () => {
  it("reads the governor's proposals with their snapshot and close blocks", async () => {
    const { governor } = await readAll();
    expect(governor.proposals.map((proposal) => [proposal.proposalId, proposal.startBlock, proposal.endBlock])).toEqual([
      ["3", 950, 990],
      ["1", 1200, 1400],
      ["2", 1600, 1800],
    ]);
    expect(governor.proposals[0].txUrl).toBe(`https://etherscan.io/tx/${governor.proposals[0].txId}`);
  });

  it("reads every vote with its voter, proposal and weight", async () => {
    const { governor } = await readAll();
    expect(governor.votes.map((vote) => [vote.voter, vote.proposalId, vote.weight])).toEqual([
      [DELEGATE_A, "1", (1000n * E18).toString()],
      [DELEGATE_B, "1", (500n * E18).toString()],
      [DELEGATE_B, "2", (500n * E18).toString()],
    ]);
  });

  it("raises a typed unsupported-governor state for an address with no contract", async () => {
    const data = fixture("unsupportedGovernor");
    await expect(
      readGovernorActivity(recordedLogReader(data), recordedCodeReader(data), GOVERNOR, "https://etherscan.io/tx/", 900, 2000),
    ).rejects.toMatchObject({ code: "unsupported_governor" });
  });

  it("raises unsupported-governor when no proposal log decodes under the Governor signature", async () => {
    const data = fixture("activeDelegates");
    data.logs = data.logs
      .filter((log) => log.topics?.[0] === GOVERNOR_TOPICS.proposalCreated)
      .map((log) => ({ ...log, data: "0xdeadbeef" }));
    await expect(
      readGovernorActivity(recordedLogReader(data), recordedCodeReader(data), GOVERNOR, "https://etherscan.io/tx/", 900, 2000),
    ).rejects.toMatchObject({ code: "unsupported_governor" });
  });

  it("leaves a vote log it cannot decode out rather than counting it", async () => {
    const data = fixture("activeDelegates");
    data.logs = data.logs.map((log) =>
      log.topics?.[0] === GOVERNOR_TOPICS.voteCast ? { ...log, data: "0xdeadbeef" } : log,
    );
    const governor = await readGovernorActivity(
      recordedLogReader(data),
      recordedCodeReader(data),
      GOVERNOR,
      "https://etherscan.io/tx/",
      900,
      2000,
    );
    expect(governor.votes).toEqual([]);
    expect(governor.proposals).toHaveLength(3);
  });
});

describe("proposalWindows", () => {
  it("keeps proposals whose voting window overlaps the scanned range", async () => {
    const { governor } = await readAll();
    expect(proposalsInRange(governor.proposals, 1000, 1500).map((proposal) => proposal.proposalId)).toEqual(["1"]);
    expect(proposalsInRange(governor.proposals, 900, 2000)).toHaveLength(3);
  });

  it("separates proposals still open at the end of the range", async () => {
    const { governor } = await readAll("dormantDelegate");
    expect(governor.proposals.map((proposal) => proposal.proposalId)).toEqual(["1", "2", "4"]);
    expect(settledProposals(governor.proposals, 2000).map((proposal) => proposal.proposalId)).toEqual(["1", "2"]);
    expect(closedByEndOfRange(governor.proposals[2], 2000)).toBe(false);
  });

  it("marks a proposal whose window reaches past the range as only partly scanned", async () => {
    const { governor } = await readAll("dormantDelegate");
    expect(governor.proposals.find((proposal) => proposal.proposalId === "4")?.fullyInRange).toBe(false);
    expect(governor.proposals.find((proposal) => proposal.proposalId === "1")?.fullyInRange).toBe(true);
  });
});

describe("measureParticipation", () => {
  it("counts only proposals during which the delegate held power", async () => {
    const { governor, series } = await readAll();
    const proposals = proposalsInRange(governor.proposals, range.fromBlock, range.toBlock);
    const a = measureParticipation(DELEGATE_A, series.get(DELEGATE_A), proposals, governor.votes, range);
    // Proposal 3 closed at block 990, before A's first checkpoint at 1000, so
    // it counts for neither delegate.
    expect(a.eligibleProposals).toEqual(["1", "2"]);
    expect(a.votedProposals).toEqual(["1"]);
    expect(a.participationBps).toBe("5000");
  });

  it("matches a hand calculation for a delegate who voted on everything they could", async () => {
    const { governor, series } = await readAll();
    const proposals = proposalsInRange(governor.proposals, range.fromBlock, range.toBlock);
    const b = measureParticipation(DELEGATE_B, series.get(DELEGATE_B), proposals, governor.votes, range);
    expect([b.eligibleProposals, b.votedProposals, b.participationBps]).toEqual([["1", "2"], ["1", "2"], "10000"]);
  });

  it("reports no rate, rather than zero, for a delegate whose power is unknown", async () => {
    const { governor, series } = await readAll("dormantDelegate");
    const proposals = proposalsInRange(governor.proposals, range.fromBlock, range.toBlock);
    const dormant = measureParticipation(DORMANT, series.get(DORMANT), proposals, governor.votes, range);
    expect(dormant.eligibleProposals).toEqual([]);
    expect(dormant.undeterminedProposals).toEqual(["1", "2"]);
    expect(dormant.participationBps).toBeNull();
    expect(dormant.notes.join(" ")).toMatch(/not counted either way/);
  });

  it("does not count an open proposal as a missed vote", async () => {
    const { governor, series } = await readAll("dormantDelegate");
    const proposals = proposalsInRange(governor.proposals, range.fromBlock, range.toBlock);
    const result = measureParticipation(DELEGATE_A, series.get(DELEGATE_A), proposals, governor.votes, range);
    expect(result.notes.join(" ")).toMatch(/still open at the end of the scanned range/);
    expect(result.eligibleProposals).not.toContain("4");
  });

  it("counts a delegate who held power at every snapshot as fully eligible when the range covers history", async () => {
    const { governor, series } = await readAll();
    const proposals = proposalsInRange(governor.proposals, 0, range.toBlock);
    const a = measureParticipation(DELEGATE_A, series.get(DELEGATE_A), proposals, governor.votes, {
      toBlock: range.toBlock,
      coversHistory: true,
    });
    expect(a.undeterminedProposals).toEqual([]);
    expect(a.eligibleProposals).toEqual(["1", "2"]);
  });
});

describe("largestDelegates", () => {
  it("names the largest delegates seen in the range when the caller named none", async () => {
    const { series } = await readAll();
    expect(largestDelegates(series, 10)).toEqual([DELEGATE_A, DELEGATE_B]);
    expect(largestDelegates(series, 1)).toEqual([DELEGATE_A]);
  });
});

describe("coverage", () => {
  it("explains a delegate with no checkpoint differently depending on the range", () => {
    const unknown = delegateNotes({ hasCheckpoints: false, truncatedSeries: false, undeterminedProposals: 0, coversHistory: false, powerKnown: false });
    expect(unknown.state).toBe("partial");
    expect(unknown.notes.join(" ")).toMatch(/unknown rather than zero/);
    const none = delegateNotes({ hasCheckpoints: false, truncatedSeries: false, undeterminedProposals: 0, coversHistory: true, powerKnown: true });
    expect(none.notes.join(" ")).toMatch(/they held no voting power/);
  });

  it("calls a fully evidenced delegate complete", () => {
    expect(
      delegateNotes({ hasCheckpoints: true, truncatedSeries: false, undeterminedProposals: 0, coversHistory: false, powerKnown: true }),
    ).toEqual({ state: "complete", notes: [] });
  });

  it("states the method, the range and that it recommends nothing", async () => {
    const { governor } = await readAll();
    const notes = reportCoverage({
      delegates: [],
      proposals: governor.proposals,
      range,
      truncatedLogs: true,
      votesRead: governor.votes.length,
    }).join(" ");
    expect(notes).toMatch(/DelegateVotesChanged checkpoints/);
    expect(notes).toMatch(/only proposals whose snapshot block found the delegate holding power/);
    expect(notes).toMatch(/Scanned blocks 900 to 2000: 3 proposal\(s\) and 3 vote\(s\)/);
    expect(notes).toMatch(/does not reach the chain's start/);
    expect(notes).toMatch(/every figure here is a floor/);
    expect(notes).toMatch(/does not rank, score or recommend delegates/);
  });
});
