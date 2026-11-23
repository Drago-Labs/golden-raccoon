import { describe, expect, it } from "vitest";
import { parseQuantity, parseUsd } from "@/server/research/performance-attribution/decimalMath";
import { AttributionError } from "@/server/research/performance-attribution/errors";
import { boundObservations, buildPeriods, resolveWindow } from "@/server/research/performance-attribution/periods";
import { assetAlias, normalizeObservation, observationValue, portfolioScope } from "@/server/research/performance-attribution/portfolioInput";
import { collectObservations, observationFromReadApi } from "@/server/research/performance-attribution/snapshotReader";
import { FOREIGN_WALLET, NETWORK, normalized, observations, scope, WALLET, WETH } from "./fixtures";

describe("resolveWindow", () => {
  it("states the window in UTC", () => {
    const window = resolveWindow("2026-11-18T00:00:00.000Z", "2026-11-20T00:00:00.000Z");
    expect([window.start, window.end]).toEqual(["2026-11-18T00:00:00.000Z", "2026-11-20T00:00:00.000Z"]);
  });

  it("refuses a reversed window and one longer than the documented bound", () => {
    expect(() => resolveWindow("2026-11-20T00:00:00.000Z", "2026-11-18T00:00:00.000Z")).toThrowError(AttributionError);
    expect(() => resolveWindow("2024-01-01T00:00:00.000Z", "2026-11-20T00:00:00.000Z")).toThrowError(/at most 370 days/);
  });
});

describe("buildPeriods", () => {
  const window = resolveWindow("2026-11-18T00:00:00.000Z", "2026-11-21T00:00:00.000Z");

  it("splits a window into aligned UTC days", () => {
    expect(buildPeriods(window, "day").map((period) => [period.label, period.start, period.end])).toEqual([
      ["2026-11-18", "2026-11-18T00:00:00.000Z", "2026-11-19T00:00:00.000Z"],
      ["2026-11-19", "2026-11-19T00:00:00.000Z", "2026-11-20T00:00:00.000Z"],
      ["2026-11-20", "2026-11-20T00:00:00.000Z", "2026-11-21T00:00:00.000Z"],
    ]);
  });

  it("clips the first and last period to the window rather than covering time nobody asked about", () => {
    const partial = resolveWindow("2026-11-18T06:00:00.000Z", "2026-11-19T06:00:00.000Z");
    expect(buildPeriods(partial, "day").map((period) => [period.start, period.end])).toEqual([
      ["2026-11-18T06:00:00.000Z", "2026-11-19T00:00:00.000Z"],
      ["2026-11-19T00:00:00.000Z", "2026-11-19T06:00:00.000Z"],
    ]);
  });

  it("aligns weeks to Monday and months to the first", () => {
    const weeks = buildPeriods(resolveWindow("2026-11-18T00:00:00.000Z", "2026-12-02T00:00:00.000Z"), "week");
    expect(weeks.map((period) => period.start)).toEqual([
      "2026-11-18T00:00:00.000Z",
      "2026-11-23T00:00:00.000Z",
      "2026-11-30T00:00:00.000Z",
    ]);
    const months = buildPeriods(resolveWindow("2026-11-18T00:00:00.000Z", "2027-01-05T00:00:00.000Z"), "month");
    expect(months.map((period) => period.label)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("refuses a window that would need more periods than the documented bound", () => {
    expect(() => buildPeriods(resolveWindow("2026-01-01T00:00:00.000Z", "2026-11-20T00:00:00.000Z"), "day")).toThrowError(
      /coarser granularity/,
    );
  });
});

describe("boundObservations", () => {
  const steady = normalized("steadyPortfolio");
  const [first, second, third] = buildPeriods(resolveWindow("2026-11-18T00:00:00.000Z", "2026-11-21T00:00:00.000Z"), "day");

  it("bounds a period with the observation at its start and the latest inside it", () => {
    const bounds = boundObservations(first, steady);
    expect([bounds.start?.at, bounds.end?.at]).toEqual(["2026-11-18T00:00:00.000Z", "2026-11-19T00:00:00.000Z"]);
    expect(boundObservations(second, steady).end?.at).toBe("2026-11-20T00:00:00.000Z");
  });

  it("leaves a period with no observation inside it unbounded rather than borrowing a neighbour's value", () => {
    const bounds = boundObservations(third, steady);
    expect(bounds.start?.at).toBe("2026-11-20T00:00:00.000Z");
    expect(bounds.end).toBeNull();
  });
});

describe("normalizeObservation", () => {
  it("parses quantities, prices and values into exact integer units", () => {
    const [observation] = normalized("steadyPortfolio");
    expect(observation.fullyPriced).toBe(true);
    expect(observation.holdings[0]).toMatchObject({
      key: WETH,
      alias: "ethereum:weth",
      quantityUnits: parseQuantity("10"),
      priceUsdUnits: parseUsd("2000"),
      valueUsdUnits: parseUsd("20000"),
    });
    expect(observationValue(observation)).toBe(parseUsd("25000"));
  });

  it("keeps an unpriced holding null and marks the observation as not fully priced", () => {
    const partial = normalized("missingPrices")[1];
    expect(partial.fullyPriced).toBe(false);
    expect(partial.holdings[1].valueUsdUnits).toBeNull();
    expect(observationValue(partial)).toBeNull();
  });

  it("refuses an observation from another wallet or network", () => {
    const [row] = observations("steadyPortfolio");
    expect(() => normalizeObservation({ ...row, walletAddress: FOREIGN_WALLET }, scope)).toThrowError(
      /another wallet or network/,
    );
    expect(() => normalizeObservation({ ...row, network: "base" }, scope)).toThrowError(/another wallet or network/);
  });

  it("refuses a malformed, duplicated or negative holding", () => {
    const [row] = observations("steadyPortfolio");
    expect(() => normalizeObservation({ ...row, holdings: [row.holdings[0], row.holdings[0]] }, scope)).toThrowError(
      /appears twice/,
    );
    expect(() =>
      normalizeObservation({ ...row, holdings: [{ ...row.holdings[0], quantity: "-1" }] }, scope),
    ).toThrowError(/negative quantity/);
    expect(() => normalizeObservation({ at: "nope" }, scope)).toThrowError(/malformed/);
  });

  it("scopes a portfolio by network and canonical wallet case", () => {
    expect(portfolioScope(WALLET.toUpperCase(), NETWORK)).toBe(portfolioScope(WALLET, NETWORK));
    expect(portfolioScope(WALLET, "base")).not.toBe(portfolioScope(WALLET, NETWORK));
    expect(assetAlias("Ethereum", "WETH")).toBe("ethereum:weth");
  });
});

describe("snapshotReader", () => {
  it("converts the portfolio read API's own shape without touching storage", () => {
    const converted = observationFromReadApi(
      {
        walletAddress: WALLET,
        createdAt: "2026-11-20T00:00:00.000Z",
        holdings: [
          { tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", chainId: "ethereum", symbol: "WETH", balance: 10, priceUsd: 2100, valueUsd: 21000 },
          { tokenAddress: "0x0E0e0E0e0E0e0E0e0E0e0E0e0E0e0E0e0E0e0E0e", chainId: "ethereum", symbol: "GOAT", balance: 1000, priceUsd: null, priceStatus: "unavailable" },
        ],
      },
      NETWORK,
      "Live portfolio read API",
    );
    const observation = normalizeObservation(converted, scope);
    expect(observation.holdings[0].key).toBe(WETH);
    expect(observation.holdings[1].priceUsdUnits).toBeNull();
    expect(observation.fullyPriced).toBe(false);
  });

  it("refuses a read with no wallet, time, holdings or asset identity", () => {
    expect(() => observationFromReadApi(null, NETWORK, "x")).toThrowError(/no wallet, time or holdings/);
    expect(() =>
      observationFromReadApi({ walletAddress: WALLET, createdAt: "2026-11-20T00:00:00.000Z", holdings: [{ chainId: "ethereum" }] }, NETWORK, "x"),
    ).toThrowError(/no asset identity/);
  });

  it("orders observations oldest first and keeps one per observation time", () => {
    const recorded = observations("steadyPortfolio");
    const collected = collectObservations([recorded[2], recorded[0], recorded[1], recorded[0]], scope);
    expect(collected.map((observation) => observation.at)).toEqual([
      "2026-11-18T00:00:00.000Z",
      "2026-11-19T00:00:00.000Z",
      "2026-11-20T00:00:00.000Z",
    ]);
  });

  it("adds the live read as one more observation", () => {
    const recorded = observations("steadyPortfolio");
    const live = { ...recorded[2], at: "2026-11-20T12:00:00.000Z", source: "Live portfolio read API" };
    const collected = collectObservations(recorded, scope, live);
    expect(collected[collected.length - 1]).toMatchObject({ at: "2026-11-20T12:00:00.000Z", source: "Live portfolio read API" });
  });

  it("refuses more observations than the documented bound", () => {
    const recorded = observations("steadyPortfolio");
    const many = Array.from({ length: 401 }, (_, index) => ({
      ...recorded[0],
      at: new Date(Date.parse("2026-01-01T00:00:00.000Z") + index * 60_000).toISOString(),
    }));
    expect(() => collectObservations(many, scope)).toThrowError(/At most 400 observations/);
  });
});
