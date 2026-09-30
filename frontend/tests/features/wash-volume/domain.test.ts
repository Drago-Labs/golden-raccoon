import { describe, expect, it } from "vitest";
import { analyzeWashVolume, type Trade } from "@/server/research/wash-volume/service";

const trade = (overrides: Partial<Trade>): Trade => ({
  tx: "0x1",
  maker: "0xaaa",
  taker: "0xbbb",
  amount: 100,
  funder: "",
  time: 0,
  page: 0,
  ...overrides,
});

describe("wash volume", () => {
  it("excludes fixture self-trades and shows their transactions", () => {
    const report = analyzeWashVolume({
      pair: "POOL",
      trades: [trade({ tx: "0xself", maker: "0xaaa", taker: "0xAAA", amount: 50 })],
    });
    const filter = report.filters.find((item) => item.id === "same-address");
    expect(filter?.excludedVolume).toBe(50);
    expect(filter?.examples.map((item) => item.tx)).toEqual(["0xself"]);
  });

  it("keeps filter totals independent of order", () => {
    const trades = [
      trade({ tx: "0xa", maker: "0xaaa", taker: "0xbbb", amount: 1000, funder: "hot", time: 0 }),
      trade({ tx: "0xb", maker: "0xbbb", taker: "0xaaa", amount: 1000, funder: "hot", time: 10 }),
      trade({ tx: "0xc", maker: "0xccc", taker: "0xddd", amount: 1000, funder: "", time: 20 }),
    ];
    const forward = analyzeWashVolume({ pair: "POOL", trades, windowMs: 100 });
    const reverse = analyzeWashVolume({ pair: "POOL", trades: [...trades].reverse(), windowMs: 100 });
    expect(forward.filters.map((item) => item.remainingVolume)).toEqual(
      reverse.filters.map((item) => item.remainingVolume),
    );
    expect(forward.filters.map((item) => item.id)).toEqual(["same-address", "same-funder", "back-and-forth", "round-repeat"]);
  });

  it("labels truncated history as partial and deduplicates pages", () => {
    const report = analyzeWashVolume({
      pair: "POOL",
      truncated: true,
      trades: [trade({ tx: "0xa", page: 0 }), trade({ tx: "0xa", page: 1 })],
    });
    expect(report.coverage).toBe("partial");
    expect(report.grossVolume).toBe(100);
  });
});
