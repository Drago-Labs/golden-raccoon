import { describe, expect, it, vi } from "vitest";
import {
  DELEGATE_LIMITS,
  DelegateParticipationError,
  readDelegateParticipation,
} from "@/server/research/delegate-participation";
import { DELEGATE_A, DELEGATE_B, DORMANT, E18, GOVERNOR, participationRequest, recordedDeps, TOKEN } from "./fixtures";

describe("readDelegateParticipation: input", () => {
  it("rejects a malformed request with a typed error", async () => {
    await expect(readDelegateParticipation({}, recordedDeps("activeDelegates"))).rejects.toBeInstanceOf(
      DelegateParticipationError,
    );
    await expect(
      readDelegateParticipation(participationRequest("activeDelegates", { tokenAddress: "0x1" }), recordedDeps("activeDelegates")),
    ).rejects.toThrowError(/request is invalid/);
  });

  it("rejects an unconfigured chain and a token that is also the governor", async () => {
    await expect(
      readDelegateParticipation(participationRequest("activeDelegates", { chain: "solana" }), recordedDeps("activeDelegates")),
    ).rejects.toThrowError(/not a configured EVM network/);
    await expect(
      readDelegateParticipation(participationRequest("activeDelegates", { governorAddress: TOKEN }), recordedDeps("activeDelegates")),
    ).rejects.toThrowError(/same contract/);
  });
});

describe("readDelegateParticipation: the recorded active fixture", () => {
  it("answers with hand-checked power and participation per delegate", async () => {
    const result = await readDelegateParticipation(participationRequest("activeDelegates"), recordedDeps("activeDelegates"));
    expect(result.state).toBe("ready");
    const report = result.report;
    expect(report.governance).toMatchObject({ chain: "ethereum", chainId: 1, tokenAddress: TOKEN, governorAddress: GOVERNOR });
    expect(report.range).toEqual({ fromBlock: 900, toBlock: 2000, coversHistory: false });

    const [a, b] = report.delegates;
    expect(a).toMatchObject({
      address: DELEGATE_A,
      currentPowerUnits: (1500n * E18).toString(),
      peakPowerUnits: (1500n * E18).toString(),
      eligibleProposals: ["1", "2"],
      votedProposals: ["1"],
      participationBps: "5000",
    });
    expect(b).toMatchObject({
      address: DELEGATE_B,
      currentPowerUnits: (500n * E18).toString(),
      eligibleProposals: ["1", "2"],
      votedProposals: ["1", "2"],
      participationBps: "10000",
    });
    expect(report.proposals.map((proposal) => proposal.proposalId)).toEqual(["3", "1", "2"]);
    expect(report.largestChanges[0]).toMatchObject({ delegate: DELEGATE_A, deltaUnits: (1000n * E18).toString() });
    expect(report.readOnly).toBe(true);
  });

  it("names the largest delegates itself when the caller names none", async () => {
    const result = await readDelegateParticipation(
      participationRequest("activeDelegates", { delegates: [] }),
      recordedDeps("activeDelegates"),
    );
    expect(result.report.delegates.map((delegate) => delegate.address)).toEqual([DELEGATE_A, DELEGATE_B]);
  });

  it("keeps each delegate's power series with its transactions", async () => {
    const result = await readDelegateParticipation(participationRequest("activeDelegates"), recordedDeps("activeDelegates"));
    const [a] = result.report.delegates;
    expect(a.series.map((point) => [point.blockNumber, point.powerUnits])).toEqual([
      [1000, (1000n * E18).toString()],
      [1500, (1500n * E18).toString()],
    ]);
    expect(a.series.every((point) => point.txUrl.startsWith("https://etherscan.io/tx/0x"))).toBe(true);
  });

  it("never returns anything a caller could submit", async () => {
    const result = await readDelegateParticipation(participationRequest("activeDelegates"), recordedDeps("activeDelegates"));
    expect(JSON.stringify(result)).not.toMatch(/signature|signedTx|xdr|calldata|privateKey/i);
  });
});

describe("readDelegateParticipation: typed states", () => {
  it("reports an unsupported governor as its own state, not as no participation", async () => {
    const result = await readDelegateParticipation(
      participationRequest("unsupportedGovernor"),
      recordedDeps("unsupportedGovernor"),
    );
    expect(result.state).toBe("unsupported_governor");
    expect(result).toMatchObject({ reason: expect.stringMatching(/holds no contract code/) });
    expect(result.report.delegates).toEqual([]);
    expect(result.report.coverage.join(" ")).toMatch(/No voting power, participation rate or delegation change was inferred/);
  });

  it("reports a provider failure as unavailable", async () => {
    const result = await readDelegateParticipation(
      participationRequest("providerUnavailable"),
      recordedDeps("providerUnavailable"),
    );
    expect(result.state).toBe("unavailable");
    expect(result).toMatchObject({ reason: expect.stringMatching(/more than 10000 results/) });
    expect(result.report.state).toBe("unavailable");
  });

  it("reports an unreadable chain head as unavailable", async () => {
    const result = await readDelegateParticipation(
      participationRequest("activeDelegates"),
      recordedDeps("activeDelegates", {
        readLatestBlock: vi.fn(async () => {
          throw new DelegateParticipationError("provider_unavailable", "the node is down");
        }),
      }),
    );
    expect(result.state).toBe("unavailable");
    expect(result).toMatchObject({ reason: expect.stringMatching(/chain head could not be read/) });
  });

  it("reports a dormant delegate as partial, with no rate invented", async () => {
    const result = await readDelegateParticipation(participationRequest("dormantDelegate"), recordedDeps("dormantDelegate"));
    expect(result.state).toBe("ready");
    const [dormant] = result.report.delegates;
    expect(dormant).toMatchObject({
      address: DORMANT,
      currentPowerUnits: null,
      peakPowerUnits: null,
      participationBps: null,
      state: "partial",
    });
    expect(dormant.undeterminedProposals).toEqual(["1", "2"]);
    expect(dormant.notes.join(" ")).toMatch(/unknown rather than zero/);
    expect(result.report.state).toBe("partial");
    expect(result.report.coverage.join(" ")).toMatch(/still open at the end of the range/);
  });

  it("refuses more delegates than the documented bound", async () => {
    const many = Array.from({ length: DELEGATE_LIMITS.maxDelegates + 1 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`);
    await expect(
      readDelegateParticipation(participationRequest("activeDelegates", { delegates: many }), recordedDeps("activeDelegates")),
    ).rejects.toThrowError(/request is invalid/);
  });

  it("publishes the documented bounds and a typed error", () => {
    expect(DELEGATE_LIMITS).toMatchObject({ maxBlockSpan: 500_000, maxDelegates: 20, maxProposals: 200, maxVotes: 2_000 });
    const error = new DelegateParticipationError("unsupported_governor", "nope");
    expect([error.name, error.code]).toEqual(["DelegateParticipationError", "unsupported_governor"]);
  });
});
