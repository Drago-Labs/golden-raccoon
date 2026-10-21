import { Networks } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { buildCoverage } from "@/server/research/network-congestion/coverage";
import { NetworkCongestionError } from "@/server/research/network-congestion/errors";
import { explainCongestion as explainFromIndex, CONGESTION_LIMITS as limitsFromIndex } from "@/server/research/network-congestion";
import { classifyHorizonTransaction, createHorizonLedgerReader } from "@/server/research/network-congestion/ledgerReader";
import { CONGESTION_LIMITS } from "@/server/research/network-congestion/limits";
import { congestionRequestSchema } from "@/server/research/network-congestion/schema";
import { explainCongestion } from "@/server/research/network-congestion/service";
import { getStellarDataApiUrls, stellarNetworks } from "@/lib/stellar/config";
import {
  createRecordedReader,
  createUnavailableReader,
  gapWindow,
  providerUnavailable,
  quietWindow,
  surgeWindow,
} from "./fixtures";

function classicMeta(): string {
  return xdr.TransactionMeta.operations([]).toXdr("base64");
}

function sorobanMeta(): string {
  const ext = xdr.SorobanTransactionMetaExt.v1(
    new xdr.SorobanTransactionMetaExtV1({
      ext: xdr.ExtensionPoint.v0(),
      totalNonRefundableResourceFeeCharged: 4000n,
      totalRefundableResourceFeeCharged: 1000n,
      rentFeeCharged: 100n,
    }),
  );
  const meta = xdr.TransactionMeta.v3(
    new xdr.TransactionMetaV3({
      ext: xdr.ExtensionPoint.v0(),
      txChangesBefore: [],
      operations: [],
      txChangesAfter: [],
      sorobanMeta: new xdr.SorobanTransactionMeta({
        ext,
        events: [],
        returnValue: xdr.ScVal.scvVoid(),
        diagnosticEvents: [],
      }),
    }),
  );

  return meta.toXdr("base64");
}

describe("schema, errors, limits, and coverage", () => {
  it("accepts one window and rejects a request that names two", () => {
    expect(congestionRequestSchema.safeParse(quietWindow.request).success).toBe(true);
    expect(congestionRequestSchema.safeParse({ network: "pubnet", fromSequence: 1, toSequence: 2, atTime: "2026-04-01T00:00:00.000Z" }).success).toBe(false);
    expect(congestionRequestSchema.safeParse({ network: "pubnet", fromSequence: 1.5, toSequence: 2 }).success).toBe(false);
  });

  it("publishes a probe budget that can cover the timestamp slack", () => {
    expect(limitsFromIndex).toBe(CONGESTION_LIMITS);
    expect(2 ** (CONGESTION_LIMITS.maxTimestampProbes - 1)).toBeGreaterThan(CONGESTION_LIMITS.timestampSlackLedgers * 2);
    expect(explainFromIndex).toBe(explainCongestion);
  });

  it("carries a code on the typed error", () => {
    const error = new NetworkCongestionError("window_too_large", "too many ledgers", { limit: CONGESTION_LIMITS.maxLedgers });

    expect(error.name).toBe("NetworkCongestionError");
    expect(error.code).toBe("window_too_large");
    expect(error.details).toEqual({ limit: 240 });
  });

  it("describes a partial window when a gap is present and an empty one when nothing was read", () => {
    expect(buildCoverage({ presentLedgerCount: 4, gaps: [{ fromSequence: 302, toSequence: 302, missingCount: 1 }], truncated: false, omittedTransactionCount: 0, unsplitCount: 0 }).state).toBe("partial");
    expect(buildCoverage({ presentLedgerCount: 0, gaps: [], truncated: false, omittedTransactionCount: 0, unsplitCount: 0 })).toMatchObject({
      state: "empty",
    });
    expect(buildCoverage({ presentLedgerCount: 3, gaps: [], truncated: false, omittedTransactionCount: 0, unsplitCount: 0 }).state).toBe("complete");
  });
});

describe("explainCongestion", () => {
  it("matches quiet, surge, and gapped fixtures exactly and does not call the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const quiet = await explainCongestion(quietWindow.request, createRecordedReader(quietWindow));
    const surge = await explainCongestion(surgeWindow.request, createRecordedReader(surgeWindow));
    const gap = await explainCongestion(gapWindow.request, createRecordedReader(gapWindow));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(quiet.fees.classicInclusion).toMatchObject({ p50: "100", p90: "100", p99: "100" });
    expect(quiet.fees.sorobanResource.p50).toBe("5000");
    expect(quiet.surges).toHaveLength(0);
    expect(quiet.capacity.meanUsageBasisPoints).toBe(233);
    expect(quiet.readOnly).toBe(true);

    expect(surge.fees.classicInclusion).toMatchObject({ sampleCount: 5, p50: "400", p90: "1000", p99: "1000" });
    expect(surge.fees.sorobanInclusion.p50).toBe("1000");
    expect(surge.fees.sorobanResource.p50).toBe("3000");
    expect(surge.surges).toHaveLength(1);
    expect(JSON.stringify(surge.fees)).not.toContain("5000");

    expect(gap.capacity.gaps).toEqual([{ fromSequence: 302, toSequence: 302, missingCount: 1 }]);
    expect(gap.capacity.meanUsageBasisPoints).toBe(8_000);
    expect(gap.fees.classicInclusion).toMatchObject({ sampleCount: 4, p50: "100", p90: "500", p99: "500" });
    expect(gap.surges.map((period) => [period.fromSequence, period.toSequence])).toEqual([
      [300, 301],
      [303, 303],
    ]);
    expect(gap.coverage.state).toBe("partial");
    fetchSpy.mockRestore();
  });

  it("surfaces provider unavailability instead of a zero report", async () => {
    const reader = createUnavailableReader(providerUnavailable.error.message);

    await expect(explainCongestion(providerUnavailable.request, reader)).rejects.toMatchObject({
      code: providerUnavailable.error.code,
      message: providerUnavailable.error.message,
    });
    expect(reader.calls).toEqual(["fail"]);
  });

  it("rejects an inverted or oversized window before reading", async () => {
    const reader = createRecordedReader(quietWindow);

    await expect(explainCongestion({ network: "stellar-pubnet", fromSequence: 12, toSequence: 10 }, reader)).rejects.toMatchObject({
      code: "window_inverted",
    });
    await expect(
      explainCongestion({ network: "stellar-pubnet", fromSequence: 1, toSequence: CONGESTION_LIMITS.maxLedgers + 1 }, reader),
    ).rejects.toMatchObject({ code: "window_too_large" });
    expect(reader.calls).toEqual([]);
  });

  it("rejects a ledger read from the other network", async () => {
    const reader = createRecordedReader({ ...quietWindow, passphrase: Networks.TESTNET });

    await expect(explainCongestion(quietWindow.request, reader)).rejects.toMatchObject({ code: "passphrase_mismatch" });
  });

  it("uses the default radius around a ledger", async () => {
    const reader = createRecordedReader(quietWindow);
    const report = await explainCongestion({ network: "public", atLedger: 100 }, reader);

    expect(reader.calls).toEqual(["readRange:96:104"]);
    expect(report.window.focusSequence).toBe(100);
    expect(report.lookup?.note).toContain("Ledger 100");
  });
});

describe("horizon ledger reader", () => {
  it("splits Soroban meta and does not treat a classic fee as a resource fee", () => {
    const classic = classifyHorizonTransaction({
      hash: "classic",
      successful: true,
      operation_count: 2,
      fee_charged: "200",
      result_meta_xdr: classicMeta(),
    });
    const soroban = classifyHorizonTransaction({
      hash: "soroban",
      successful: true,
      operation_count: 1,
      fee_charged: "5100",
      result_meta_xdr: sorobanMeta(),
    });

    expect(classic).toMatchObject({ transaction: { split: "classic", classicInclusionFeeStroops: "200", sorobanResourceFeeStroops: null } });
    expect(soroban).toMatchObject({
      transaction: { split: "soroban", sorobanInclusionFeeStroops: "100", sorobanResourceFeeStroops: "5000", sorobanRentFeeStroops: "100" },
    });
    expect(classifyHorizonTransaction({ hash: "bare", operation_count: 1, fee_charged: "100" })).toEqual({ omitted: true });
  });

  it("reads a window from injected Horizon pages and records the sequence hole", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const calls: string[] = [];
    const allowed = new URL(getStellarDataApiUrls(stellarNetworks["stellar-pubnet"])[0]).origin;
    const reader = createHorizonLedgerReader({
      pageSize: 1,
      fetchImpl: async (url) => {
        calls.push(url);
        const parsed = new URL(url);
        expect(parsed.origin).toBe(allowed);

        if (parsed.pathname === "/ledgers" && parsed.searchParams.get("cursor") === "99") {
          return Response.json({
            _embedded: {
              records: [horizonLedger(100, "100")],
            },
          });
        }

        if (parsed.pathname === "/ledgers" && parsed.searchParams.get("cursor") === "100") {
          return Response.json({
            _embedded: {
              records: [horizonLedger(102, "102")],
            },
          });
        }

        if (parsed.pathname.endsWith("/transactions")) {
          return Response.json({
            _embedded: {
              records: [
                {
                  hash: "paged",
                  successful: true,
                  operation_count: 1,
                  fee_charged: "100",
                  result_meta_xdr: classicMeta(),
                  paging_token: "paged",
                },
              ],
            },
          });
        }

        return new Response("missing", { status: 404 });
      },
    });

    const read = await reader.readRange(
      { id: "stellar-pubnet", passphrase: Networks.PUBLIC, caip2: "stellar:pubnet" },
      100,
      102,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(read.ledgers.map((ledger) => ledger.sequence)).toEqual([100, 102]);
    expect(read.ledgers[0].transactions[0]).toMatchObject({ split: "classic", classicInclusionFeeStroops: "100" });
    expect(calls.every((url) => new URL(url).origin === allowed)).toBe(true);
    fetchSpy.mockRestore();
  });

  it("maps HTTP 503 and a timeout onto typed errors", async () => {
    const unavailable = createHorizonLedgerReader({
      fetchImpl: async () => new Response("down", { status: 503 }),
    });
    const timedOut = createHorizonLedgerReader({
      fetchImpl: async () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      },
    });
    const network = { id: "stellar-pubnet" as const, passphrase: Networks.PUBLIC, caip2: "stellar:pubnet" as const };

    await expect(unavailable.readHeader(network, 1)).rejects.toMatchObject({ code: "provider_unavailable" });
    await expect(timedOut.readHeader(network, 1)).rejects.toMatchObject({ code: "provider_timeout" });
  });
});

function horizonLedger(sequence: number, pagingToken: string) {
  return {
    sequence,
    closed_at: "2026-04-01T00:00:00.000Z",
    tx_set_operation_count: 1,
    operation_count: 1,
    max_tx_set_size: 100,
    base_fee_in_stroops: 100,
    paging_token: pagingToken,
  };
}
