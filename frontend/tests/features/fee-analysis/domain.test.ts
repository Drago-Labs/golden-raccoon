import { describe, expect, it } from "vitest";
import { analyseFees } from "@/server/research/fee-analysis/service";
import { formatBaseUnits, parseAmount, sumBaseUnits } from "@/server/research/fee-analysis/unitMath";
import {
  ETH_PRICE,
  EVM_BASE,
  EVM_FAILED,
  EVM_OTHER_WALLET,
  EVM_OUT_OF_WINDOW,
  EVM_PENDING,
  EVM_REPLACED,
  EVM_REPLACEMENT,
  EVM_SUCCESS,
  EVM_UNREADABLE,
  FULL_WORLD,
  OTHER_WALLET,
  STELLAR_FEE_BUMP,
  STELLAR_FEE_PAYER,
  STELLAR_LOCAL_FEE,
  STELLAR_RESOURCE_FEE,
  STELLAR_SOURCE,
  WALLET,
  XLM_PRICE,
  createFeeReader,
  request,
} from "./fixtures";

const EVERY_RECORD = [
  EVM_SUCCESS,
  EVM_FAILED,
  EVM_REPLACED,
  EVM_REPLACEMENT,
  EVM_PENDING,
  EVM_OTHER_WALLET,
  EVM_OUT_OF_WINDOW,
  EVM_BASE,
  STELLAR_LOCAL_FEE,
  STELLAR_FEE_BUMP,
  STELLAR_RESOURCE_FEE,
];

describe("exact arithmetic", () => {
  it("keeps every digit of a wei-scale sum that floating point would lose", () => {
    const operands = ["21000000000000001", "21000000000000001"];

    // What the same sum costs in doubles: the trailing digits are gone, and
    // the wrong answer is the one that would have reached the total.
    expect(String(Number(operands[0]) + Number(operands[1]))).toBe("42000000000000000");

    expect(sumBaseUnits(operands)).toBe("42000000000000002");
  });

  it("formats base units without a floating-point detour", () => {
    expect(formatBaseUnits("21000000000000000", 18)).toBe("0.021");
    expect(formatBaseUnits("100", 7)).toBe("0.00001");
    expect(formatBaseUnits("0", 18)).toBe("0");
  });

  it("refuses a value that is not an integer amount", () => {
    expect(parseAmount("1.5")).toBeNull();
    expect(parseAmount("not a number")).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe("what counts and what does not", () => {
  it("keeps a failed transaction that was still charged", async () => {
    const report = await analyseFees(request(), [EVM_FAILED], createFeeReader(FULL_WORLD));

    expect(report.charges).toHaveLength(1);
    expect(report.charges[0].outcome).toBe("failed");
    expect(report.charges[0].amountBaseUnits).toBe("420000000000000");
  });

  it("attributes a replaced transaction's charge to its replacement only", async () => {
    const report = await analyseFees(request(), [EVM_REPLACED, EVM_REPLACEMENT], createFeeReader(FULL_WORLD));

    expect(report.charges).toHaveLength(1);
    expect(report.charges[0].hash).toBe("0xaaa4");

    const superseded = report.excluded.find((entry) => entry.hash === "0xaaa3");

    expect(superseded?.reason).toBe("superseded_by_replacement");
    expect(superseded?.supersededBy).toBe("0xaaa4");
  });

  it("counts one hash once however many times it is observed", async () => {
    const report = await analyseFees(request(), [EVM_SUCCESS, EVM_SUCCESS, EVM_SUCCESS], createFeeReader(FULL_WORLD));

    expect(report.charges).toHaveLength(1);
    expect(report.excluded.filter((entry) => entry.reason === "duplicate_observation")).toHaveLength(2);
    expect(report.byNetwork[0].byAsset[0].observedBaseUnits).toBe("420000000000000");
  });

  it("excludes a transaction that has not reached a terminal state", async () => {
    const report = await analyseFees(request(), [EVM_PENDING], createFeeReader(FULL_WORLD));

    expect(report.charges).toHaveLength(0);
    expect(report.excluded[0].reason).toBe("not_terminal");
  });

  it("excludes another wallet's records", async () => {
    const report = await analyseFees(request(), [EVM_OTHER_WALLET], createFeeReader(FULL_WORLD));

    expect(report.excluded[0].reason).toBe("other_wallet");
    expect(JSON.stringify(report.charges)).not.toContain(OTHER_WALLET);
  });

  it("excludes records outside the window", async () => {
    const report = await analyseFees(request(), [EVM_OUT_OF_WINDOW], createFeeReader(FULL_WORLD));

    expect(report.excluded[0].reason).toBe("out_of_window");
  });

  it("narrows to one network when asked", async () => {
    const report = await analyseFees(request({ network: "base" }), [EVM_SUCCESS, EVM_BASE], createFeeReader(FULL_WORLD));

    expect(report.charges).toHaveLength(1);
    expect(report.charges[0].network).toBe("base");
    expect(report.excluded[0].reason).toBe("other_network");
  });
});

describe("payer attribution", () => {
  it("adds the L1 data fee to an L2 execution charge", async () => {
    const report = await analyseFees(request(), [EVM_BASE], createFeeReader(FULL_WORLD));

    // 21,000 × 1 gwei = 21,000,000,000,000, plus an L1 fee of 2e18.
    expect(report.charges[0].amountBaseUnits).toBe("2000021000000000000");
    expect(report.charges[0].provenance).toContain("L1 data fee");
  });

  it("names the fee-bump payer separately from the transaction source", async () => {
    const report = await analyseFees(request(), [STELLAR_FEE_BUMP], createFeeReader(FULL_WORLD));

    expect(report.charges[0].payer).toBe(STELLAR_FEE_PAYER);
    expect(report.charges[0].feeBumpPayer).toBe(STELLAR_FEE_PAYER);
    expect(report.charges[0].originalSource).toBe(STELLAR_SOURCE);
  });

  it("leaves the fee-bump fields null when one account paid for itself", async () => {
    const report = await analyseFees(request(), [STELLAR_RESOURCE_FEE], createFeeReader(FULL_WORLD));

    expect(report.charges[0].feeBumpPayer).toBeNull();
    expect(report.charges[0].originalSource).toBeNull();
    expect(report.charges[0].payer).toBe(STELLAR_SOURCE);
  });

  it("adds a Soroban resource fee to the base fee", async () => {
    const report = await analyseFees(request(), [STELLAR_RESOURCE_FEE], createFeeReader(FULL_WORLD));

    expect(report.charges[0].amountBaseUnits).toBe("4421");
    expect(report.charges[0].provenance).toContain("resource fee");
  });

  it("uses a record's own fee metadata instead of spending a read", async () => {
    const reader = createFeeReader(FULL_WORLD);
    const report = await analyseFees(request(), [STELLAR_LOCAL_FEE], reader);

    expect(report.charges[0].amountBaseUnits).toBe("100");
    expect(report.charges[0].provenance).toContain("from the stored record");
    expect(reader.readCount()).toBe(0);
  });
});

describe("unknown amounts", () => {
  it("never turns an unreadable charge into a zero", async () => {
    const report = await analyseFees(request(), [EVM_UNREADABLE], createFeeReader(FULL_WORLD));

    expect(report.charges[0].evidence).toBe("unknown");
    expect(report.charges[0].amountBaseUnits).toBeNull();
    expect(report.charges[0].unknownReason).toContain("effectiveGasPrice");
    expect(report.byNetwork[0].byAsset[0].observedBaseUnits).toBe("0");
    expect(report.byNetwork[0].byAsset[0].unknownCount).toBe(1);
  });

  it("keeps observed totals separate from unknown counts", async () => {
    const report = await analyseFees(request(), [EVM_SUCCESS, EVM_UNREADABLE], createFeeReader(FULL_WORLD));
    const asset = report.byNetwork[0].byAsset[0];

    expect(asset.observedCount).toBe(1);
    expect(asset.unknownCount).toBe(1);
    expect(asset.observedBaseUnits).toBe("420000000000000");
    expect(report.coverage.state).toBe("partial");
  });

  it("reports a read failure as unknown rather than failing the analysis", async () => {
    const reader = createFeeReader({ receipts: { "0xaaa1": new Error("provider timeout") } });
    const report = await analyseFees(request(), [EVM_SUCCESS], reader);

    expect(report.charges[0].evidence).toBe("unknown");
    expect(report.charges[0].unknownReason).toContain("provider timeout");
    expect(report.coverage.state).toBe("unavailable");
  });

  it("never reports a refund it did not observe", async () => {
    const report = await analyseFees(request(), [EVM_SUCCESS], createFeeReader(FULL_WORLD));

    expect(report.charges[0].refundBaseUnits).toBeNull();
    expect(report.byNetwork[0].byAsset[0].refundBaseUnits).toBe("0");
  });
});

describe("fiat conversion", () => {
  it("produces no fiat figure without a price", async () => {
    const report = await analyseFees(request(), [EVM_SUCCESS], createFeeReader(FULL_WORLD));

    expect(report.byNetwork[0].byAsset[0].fiat).toBeNull();
    expect(report.fiatUnavailableReason).toMatch(/no timestamped price/i);
  });

  it("carries the price and the time it was true with the figure", async () => {
    const report = await analyseFees(request({ conversions: [ETH_PRICE] }), [EVM_SUCCESS], createFeeReader(FULL_WORLD));
    const fiat = report.byNetwork[0].byAsset[0].fiat;

    expect(fiat?.unitPriceUsd).toBe(2000);
    expect(fiat?.pricedAt).toBe(ETH_PRICE.pricedAt);
    expect(fiat?.amount).toBeCloseTo(0.84, 6);
    expect(report.fiatUnavailableReason).toBeNull();
  });

  it("refuses one fiat total across two assets", async () => {
    const report = await analyseFees(
      request({ conversions: [ETH_PRICE, XLM_PRICE] }),
      [EVM_SUCCESS, STELLAR_LOCAL_FEE],
      createFeeReader(FULL_WORLD),
    );

    expect(report.byNetwork).toHaveLength(2);
    expect(report.fiatUnavailableReason).toMatch(/more than one asset/i);
  });

  it("withholds a fiat figure for an asset with an unreadable charge in it", async () => {
    const report = await analyseFees(
      request({ conversions: [ETH_PRICE] }),
      [EVM_SUCCESS, EVM_UNREADABLE],
      createFeeReader(FULL_WORLD),
    );

    expect(report.byNetwork[0].byAsset[0].fiat).toBeNull();
    expect(report.fiatUnavailableReason).toMatch(/looks like a complete total/i);
  });

  it("prices a missing asset at nothing rather than at zero", async () => {
    const report = await analyseFees(
      request({ conversions: [ETH_PRICE] }),
      [EVM_SUCCESS, STELLAR_LOCAL_FEE],
      createFeeReader(FULL_WORLD),
    );
    const stellar = report.byNetwork.find((entry) => entry.network === "pubnet");

    expect(stellar?.byAsset[0].fiat).toBeNull();
  });
});

describe("aggregation", () => {
  it("groups by network, category and time bucket", async () => {
    const report = await analyseFees(request(), EVERY_RECORD, createFeeReader(FULL_WORLD));

    expect(report.byNetwork.map((entry) => entry.network).sort()).toEqual(["base", "ethereum", "pubnet"]);
    expect(report.byCategory.map((entry) => entry.category)).toContain("approval");
    expect(report.timeline.length).toBeGreaterThan(1);
    expect(report.timeline[0].startsAt < report.timeline[1].startsAt).toBe(true);
  });

  it("buckets by month when asked", async () => {
    const report = await analyseFees(request({ bucket: "month" }), EVERY_RECORD, createFeeReader(FULL_WORLD));

    expect(report.timeline).toHaveLength(1);
    expect(report.timeline[0].startsAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("never mixes two assets inside one total", async () => {
    const report = await analyseFees(request(), EVERY_RECORD, createFeeReader(FULL_WORLD));

    for (const network of report.byNetwork) {
      for (const asset of network.byAsset) {
        expect(asset.asset.network).toBe(network.network);
      }
    }
  });
});

describe("coverage and guarantees", () => {
  it("returns a successful empty result for a window with no records", async () => {
    const report = await analyseFees(request(), [], createFeeReader(FULL_WORLD));

    expect(report.coverage.state).toBe("empty");
    expect(report.charges).toHaveLength(0);
  });

  it("returns empty, not unavailable, when every record was excluded", async () => {
    const report = await analyseFees(request(), [EVM_PENDING], createFeeReader(FULL_WORLD));

    expect(report.coverage.state).toBe("empty");
    expect(report.coverage.note).toMatch(/excluded from fee attribution/i);
  });

  it("reports complete coverage when every charge was observed", async () => {
    const report = await analyseFees(request(), [EVM_SUCCESS, EVM_FAILED], createFeeReader(FULL_WORLD));

    expect(report.coverage.state).toBe("complete");
    expect(report.coverage.observedCount).toBe(2);
  });

  it("declares that it changed no record and no fee policy", async () => {
    const report = await analyseFees(request(), [EVM_SUCCESS], createFeeReader(FULL_WORLD));

    expect(report.readOnly).toBe(true);
    expect(report.feePolicyUnchanged).toBe(true);
  });

  it("leaves the supplied records untouched", async () => {
    const before = JSON.stringify(EVERY_RECORD);
    await analyseFees(request(), EVERY_RECORD, createFeeReader(FULL_WORLD));

    expect(JSON.stringify(EVERY_RECORD)).toBe(before);
  });

  it("issues no read for a record it excluded", async () => {
    const reader = createFeeReader(FULL_WORLD);
    await analyseFees(request(), [EVM_PENDING, EVM_OUT_OF_WINDOW, EVM_OTHER_WALLET], reader);

    expect(reader.readCount()).toBe(0);
  });

  it("rejects a window that ends before it begins", async () => {
    await expect(
      analyseFees(request({ from: "2026-03-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" }), [], createFeeReader({})),
    ).rejects.toMatchObject({ code: "invalid_window" });
  });

  it("rejects a window longer than the published limit", async () => {
    await expect(
      analyseFees(request({ from: "2020-01-01T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z" }), [], createFeeReader({})),
    ).rejects.toMatchObject({ code: "window_too_large" });
  });

  it("rejects a request with no wallet", async () => {
    await expect(analyseFees(request({ walletAddress: "" }), [], createFeeReader({}))).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("records the wallet it was asked about", async () => {
    const report = await analyseFees(request(), [EVM_SUCCESS], createFeeReader(FULL_WORLD));

    expect(report.walletAddress).toBe(WALLET);
  });
});
