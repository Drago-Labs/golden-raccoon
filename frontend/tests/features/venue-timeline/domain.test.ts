import { describe, expect, it } from "vitest";
import { buildVenueTimeline, type VenueObservation } from "@/server/research/venue-timeline/service";

const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const observation = (overrides: Partial<VenueObservation>): VenueObservation => ({
  venue: "dex-a",
  chainId: 1,
  contract: TOKEN,
  ticker: "AAA",
  reachable: true,
  state: "listed",
  observedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("venue timeline", () => {
  it("excludes a ticker collision with a different contract", () => {
    const report = buildVenueTimeline({
      chainId: 1,
      contract: TOKEN,
      snapshots: [[
        observation({}),
        observation({ venue: "dex-b", contract: OTHER, ticker: "AAA" }),
      ]],
    });
    expect(report.venues.map((item) => item.venue)).toEqual(["dex-a"]);
  });

  it("marks an unreachable venue unknown", () => {
    const report = buildVenueTimeline({
      chainId: 1,
      contract: TOKEN,
      snapshots: [[observation({ reachable: false, state: "listed" })]],
    });
    expect(report.venues[0]?.state).toBe("unknown");
  });

  it("detects and orders transitions between snapshots", () => {
    const report = buildVenueTimeline({
      chainId: 1,
      contract: TOKEN,
      snapshots: [
        [observation({ observedAt: "2026-02-01T00:00:00.000Z", state: "paused" })],
        [observation({ observedAt: "2026-01-01T00:00:00.000Z", state: "listed" })],
        [observation({ venue: "dex-b", observedAt: "2026-01-15T00:00:00.000Z", state: "delisted" })],
      ],
    });
    expect(report.timeline.map((item) => `${item.venue}:${item.to}`)).toEqual([
      "dex-a:listed",
      "dex-b:delisted",
      "dex-a:paused",
    ]);
  });
});
