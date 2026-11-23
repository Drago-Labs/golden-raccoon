import { describe, expect, it } from "vitest";
import { chainCoverage, reportNotes, reportState } from "@/server/research/stablecoin-flows/coverage";
import type { ChainReadResult, FlowEvent } from "@/server/research/stablecoin-flows/schema";
import { deployment, stellarDeployment, window_ } from "./fixtures";

const ethereum = deployment("ethereum");
const stellar = stellarDeployment();

function event(at: string): FlowEvent {
  return {
    chain: "ethereum",
    direction: "mint",
    amountUnits: "10000000",
    amount: "1",
    at,
    day: at.slice(0, 10),
    txId: "0xa",
    txUrl: "https://etherscan.io/tx/0xa",
    source: "fixture",
  };
}

function read(overrides: Partial<ChainReadResult> & { chain: string }): ChainReadResult {
  return { events: [], truncated: false, ...overrides };
}

describe("chainCoverage", () => {
  it("reports a fully read chain as complete with its first and last event", () => {
    const [coverage] = chainCoverage(
      [read({ chain: "ethereum", events: [event("2026-11-18T06:00:00.000Z"), event("2026-11-19T12:00:00.000Z")] })],
      [ethereum]);
    expect(coverage).toMatchObject({
      chain: "ethereum",
      state: "complete",
      eventCount: 2,
      truncated: false,
      firstEventAt: "2026-11-18T06:00:00.000Z",
      lastEventAt: "2026-11-19T12:00:00.000Z",
      identity: ethereum.address,
      sourceUrl: ethereum.sourceUrl,
    });
  });

  it("explains that a chain which could not be read is left out of the totals", () => {
    const [coverage] = chainCoverage(
      [read({ chain: "ethereum", failure: "ethereum could not be read: query returned more than 10000 results." })],
      [ethereum]);
    expect(coverage.state).toBe("unavailable");
    expect(coverage.notes.join(" ")).toMatch(/more than 10000 results/);
    expect(coverage.notes.join(" ")).toMatch(/left out of the totals/);
  });

  it("marks a truncated page and a range that misses the window start as partial", () => {
    const [truncated, ranged] = chainCoverage(
      [
        read({ chain: "ethereum", events: [event("2026-11-19T12:00:00.000Z")], truncated: true }),
        read({ chain: "stellar", rangeNote: "Horizon paging stopped before the start of the window." }),
      ],
      [ethereum, stellar]);
    expect(truncated.state).toBe("partial");
    expect(truncated.notes.join(" ")).toMatch(/older events in the window are missing/);
    expect(ranged.state).toBe("partial");
    expect(ranged.notes.join(" ")).toMatch(/stopped before the start of the window/);
  });

  it("says plainly when a chain was read and had nothing to report", () => {
    const [coverage] = chainCoverage([read({ chain: "ethereum" })], [ethereum]);
    expect(coverage.state).toBe("complete");
    expect(coverage.notes.join(" ")).toMatch(/reported no mint or burn/);
  });

  it("reports a deployment with no read result at all as unavailable", () => {
    const [coverage] = chainCoverage([], [ethereum]);
    expect(coverage.state).toBe("unavailable");
    expect(coverage.notes[0]).toMatch(/was not read/);
  });

  it("names the Stellar identity as the asset and issuer it read", () => {
    const [coverage] = chainCoverage([read({ chain: "stellar" })], [stellar]);
    expect(coverage.identity).toBe(`${stellar.assetCode}:${stellar.issuer}`);
  });
});

describe("reportState", () => {
  const complete = chainCoverage([{ chain: "ethereum", events: [], truncated: false }], [ethereum]);

  it("is complete only when every chain is complete", () => {
    expect(reportState(complete)).toBe("complete");
  });

  it("is partial when any chain is incomplete and unavailable when all are", () => {
    expect(
      reportState(
        chainCoverage(
          [
            { chain: "ethereum", events: [], truncated: true },
            { chain: "stellar", events: [], truncated: false },
          ],
          [ethereum, stellar]),
      ),
    ).toBe("partial");
    expect(
      reportState(
        chainCoverage([{ chain: "ethereum", events: [], truncated: false, failure: "down" }], [ethereum]),
      ),
    ).toBe("unavailable");
    expect(reportState([])).toBe("unavailable");
  });
});

describe("reportNotes", () => {
  it("states the method, the window and that nothing is forecast", () => {
    const notes = reportNotes(
      chainCoverage([{ chain: "ethereum", events: [event("2026-11-18T06:00:00.000Z")], truncated: false }], [ethereum]),
      [event("2026-11-18T06:00:00.000Z")],
      window_(),
    );
    expect(notes.join(" ")).toMatch(/zero-address ERC-20 Transfer logs/);
    expect(notes.join(" ")).toMatch(/2026-11-18T00:00:00.000Z through 2026-11-20T00:00:00.000Z/);
    expect(notes.join(" ")).toMatch(/forecasts nothing/);
  });

  it("names the chains that are absent and the ones that are only a floor", () => {
    const coverage = chainCoverage(
      [
        { chain: "ethereum", events: [], truncated: false, failure: "provider down" },
        { chain: "stellar", events: [], truncated: true },
      ],
      [ethereum, stellar]);
    const notes = reportNotes(coverage, [], window_()).join(" ");
    expect(notes).toMatch(/absent from every total: ethereum/);
    expect(notes).toMatch(/a floor rather than a sum: stellar/);
    expect(notes).toMatch(/No mint or burn was recorded/);
  });
});
