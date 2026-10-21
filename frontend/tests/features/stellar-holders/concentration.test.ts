import { describe, expect, it } from "vitest";
import { computeConcentration, formatBaseUnits, parseBaseUnits } from "@/server/research/stellar-holders/concentration";
import { concentrated } from "./fixtures";

/**
 * Hand arithmetic, kept as literals.
 *
 * Ascending 5, 15, 30, 50. n = 4. S = 100.
 * Weighted sum W = 1*5 + 2*15 + 3*30 + 4*50 = 325.
 * Gini numerator = 2*325 - 5*100 = 150. Denominator = 4*100 = 400. Gini = 3/8.
 * Herfindahl = (2500 + 900 + 225 + 25) / 10000 = 3650/10000 = 73/200.
 * Top 1 = 50/100 = 1/2. Top 5 takes every holder = 1/1.
 *
 * Public float drops the 50 distribution balance: 5, 15, 30. S = 50. n = 3.
 * W = 1*5 + 2*15 + 3*30 = 125.
 * Gini = (250 - 4*50) / (3*50) = 50/150 = 1/3.
 * Herfindahl = 1150/2500 = 23/50. Top 1 = 30/50 = 3/5.
 *
 * 1, 2, 3: W = 14, S = 6, Gini = (28 - 24) / 18 = 2/9.
 * Herfindahl = 14/36 = 7/18. Top 1 = 3/6 = 1/2.
 */
describe("concentration", () => {
  it("matches the hand-computed Gini, Herfindahl, and top share for 1, 2, 3", () => {
    const concentration = computeConcentration([1n, 2n, 3n], [1, 5]);

    expect(concentration.gini).toEqual({ numerator: "2", denominator: "9" });
    expect(concentration.herfindahl).toEqual({ numerator: "7", denominator: "18" });
    expect(concentration.topShares.find((share) => share.n === 1)?.share).toEqual({ numerator: "1", denominator: "2" });
    expect(concentration.topShares.find((share) => share.n === 5)?.share).toEqual({ numerator: "1", denominator: "1" });
  });

  it("matches the concentrated-asset fixture, including the public float without the distributor", () => {
    const scale = 10_000_000n;
    const balances = concentrated.pages[0].records.map((record) => parseBaseUnits(record.balance));
    const accounts = computeConcentration(balances, [1, 5, 10]);
    const publicFloat = computeConcentration(balances.filter((amount) => amount !== 50n * scale), [1, 5, 10]);

    expect(accounts.holderCount).toBe(4);
    expect(accounts.totalBaseUnits).toBe(100n * scale);
    expect(accounts.gini).toEqual({ numerator: "3", denominator: "8" });
    expect(accounts.herfindahl).toEqual({ numerator: "73", denominator: "200" });
    expect(accounts.topShares.find((share) => share.n === 1)?.share).toEqual({ numerator: "1", denominator: "2" });
    expect(accounts.topShares.find((share) => share.n === 5)?.share).toEqual({ numerator: "1", denominator: "1" });

    expect(publicFloat.holderCount).toBe(3);
    expect(publicFloat.gini).toEqual({ numerator: "1", denominator: "3" });
    expect(publicFloat.herfindahl).toEqual({ numerator: "23", denominator: "50" });
    expect(publicFloat.topShares.find((share) => share.n === 1)?.share).toEqual({ numerator: "3", denominator: "5" });
  });

  it("gives equal holders a zero Gini and a one-half Herfindahl", () => {
    const concentration = computeConcentration([10n, 10n], [1]);

    expect(concentration.gini).toEqual({ numerator: "0", denominator: "1" });
    expect(concentration.herfindahl).toEqual({ numerator: "1", denominator: "2" });
    expect(concentration.topShares[0]?.share).toEqual({ numerator: "1", denominator: "2" });
  });

  it("leaves zero balances out of the population", () => {
    const concentration = computeConcentration([0n, 10n, 10n], [1]);

    expect(concentration.holderCount).toBe(2);
    expect(concentration.gini).toEqual({ numerator: "0", denominator: "1" });
  });

  it("is undefined when there is no positive balance", () => {
    const concentration = computeConcentration([], [1]);

    expect(concentration.defined).toBe(false);
    expect(concentration.gini).toEqual({ numerator: "0", denominator: "0" });
  });

  it("parses a base-unit integer that a float cannot hold", () => {
    expect(parseBaseUnits("900719925.4740993")).toBe(9007199254740993n);
    expect(formatBaseUnits(9007199254740993n)).toBe("900719925.4740993");
    expect(BigInt(Math.round(Number("900719925.4740993") * 10_000_000))).not.toBe(9007199254740993n);
  });
});
