import { describe, expect, it } from "vitest";
import {
  computeConcentration,
  formatStroops,
  parseStroops,
} from "@/server/research/counterparty-flows/concentration";
import { aggregateFlows } from "@/server/research/counterparty-flows/aggregation";
import { createDirectoryResolver, labelCounterparties } from "@/server/research/counterparty-flows/counterpartyLabels";
import { exchangeHeavy } from "./fixtures";

/**
 * Hand arithmetic for exchange-heavy outflows: 80 and 20 (stroops scale 1e7).
 * S = 100. Top-1 = 80/100 = 4/5.
 * HHI = (80² + 20²) / 100² = (6400 + 400) / 10000 = 6800/10000 = 17/25.
 *
 * Small integers 1, 2, 3: S = 6. Top-1 = 3/6 = 1/2.
 * HHI = (1 + 4 + 9) / 36 = 14/36 = 7/18.
 */
describe("concentration", () => {
  it("matches hand calculations for 1, 2, 3", () => {
    const concentration = computeConcentration([1n, 2n, 3n], [1, 5]);
    expect(concentration.herfindahl).toEqual({ numerator: "7", denominator: "18" });
    expect(concentration.topShares.find((share) => share.n === 1)?.share).toEqual({
      numerator: "1",
      denominator: "2",
    });
  });

  it("matches exchange-heavy outflow totals by hand", () => {
    const labels = labelCounterparties(
      exchangeHeavy.events.map((event) => event.counterparty),
      createDirectoryResolver(exchangeHeavy.labels),
    );
    const totals = aggregateFlows(exchangeHeavy.events, labels);
    const outAmounts = totals
      .filter((row) => row.direction === "out" && row.asset === "native")
      .map((row) => parseStroops(row.amount));

    const concentration = computeConcentration(outAmounts, [1, 3]);
    expect(concentration.defined).toBe(true);
    expect(concentration.counterpartyCount).toBe(2);
    expect(formatStroops(concentration.totalStroops)).toBe("100.0000000");
    expect(concentration.topShares.find((share) => share.n === 1)?.share).toEqual({
      numerator: "4",
      denominator: "5",
    });
    expect(concentration.herfindahl).toEqual({ numerator: "17", denominator: "25" });
  });

  it("is undefined when there is no positive volume", () => {
    const concentration = computeConcentration([], [1]);
    expect(concentration.defined).toBe(false);
    expect(concentration.herfindahl).toEqual({ numerator: "0", denominator: "0" });
  });
});
