import { describe, expect, it, vi } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { NetworkCongestionError } from "@/server/research/network-congestion/errors";
import { assertPassphrase, identifyNetwork } from "@/server/research/network-congestion/networkIdentity";
import { expandAround, resolveClosedLedger, searchBounds } from "@/server/research/network-congestion/timestampLookup";
import { explainCongestion } from "@/server/research/network-congestion/service";
import { createTimelineReader, quietWindow } from "./fixtures";

describe("network identity", () => {
  it("accepts the public and test network aliases", () => {
    expect(identifyNetwork("pubnet")).toMatchObject({ id: "stellar-pubnet", passphrase: Networks.PUBLIC, caip2: "stellar:pubnet" });
    expect(identifyNetwork("stellar")).toMatchObject({ id: "stellar-testnet", passphrase: Networks.TESTNET });
    expect(identifyNetwork("Stellar-Mainnet").passphrase).toBe(Networks.PUBLIC);
  });

  it("rejects a network this feature does not read", () => {
    expect(() => identifyNetwork("ethereum")).toThrow(NetworkCongestionError);
    expect(() => identifyNetwork("ethereum")).toThrow(/unknown_network|No Stellar network/);

    try {
      identifyNetwork("ethereum");
    } catch (error) {
      expect(error).toMatchObject({ code: "unknown_network" });
    }
  });

  it("refuses a passphrase that belongs to the other network", () => {
    const pubnet = identifyNetwork("stellar-pubnet");

    expect(() => assertPassphrase(pubnet, Networks.TESTNET)).toThrow(NetworkCongestionError);
    expect(() => assertPassphrase(pubnet, Networks.PUBLIC)).not.toThrow();
  });
});

describe("timestamp lookup", () => {
  const headers = [1, 2, 3, 4].map((sequence) => ({
    sequence,
    closedAt: new Date(Date.parse("2026-05-01T00:00:00.000Z") + (sequence - 1) * 5_000).toISOString(),
  }));

  async function readHeader(sequence: number) {
    return headers.find((header) => header.sequence === sequence) ?? null;
  }

  it("expands a ledger by a radius and never steps below ledger 1", () => {
    expect(expandAround(100, 4)).toEqual({ fromSequence: 96, toSequence: 104 });
    expect(expandAround(2, 5)).toEqual({ fromSequence: 1, toSequence: 7 });
  });

  it("selects the latest close at or before the timestamp", async () => {
    const match = await resolveClosedLedger({
      latest: headers[3],
      at: "2026-05-01T00:00:07.000Z",
      readHeader,
      slackLedgers: 10,
    });

    expect(match.sequence).toBe(2);
    expect(match.closedAt).toBe(headers[1].closedAt);
  });

  it("returns the latest ledger when the timestamp is its close", async () => {
    const match = await resolveClosedLedger({
      latest: headers[3],
      at: headers[3].closedAt,
      readHeader,
    });

    expect(match).toMatchObject({ sequence: 4, probes: 0 });
  });

  it("does not assign a ledger to a moment before the first close or after the latest", async () => {
    await expect(
      resolveClosedLedger({
        latest: headers[3],
        at: "2026-05-01T00:00:20.000Z",
        readHeader,
      }),
    ).rejects.toMatchObject({ code: "timestamp_not_closed" });

    await expect(
      resolveClosedLedger({
        latest: headers[3],
        at: "2026-04-30T23:59:59.000Z",
        readHeader,
        slackLedgers: 10,
      }),
    ).rejects.toMatchObject({ code: "timestamp_not_closed" });
  });

  it("centres the search on a five-second close without using that estimate as the answer", () => {
    const bounds = searchBounds({
      latestSequence: 100,
      latestClosedAt: "2026-05-01T00:00:20.000Z",
      at: "2026-05-01T00:00:07.000Z",
      slackLedgers: 5,
      nominalCloseSeconds: 5,
    });

    expect(bounds.estimate).toBe(98);
    expect(bounds).toMatchObject({ low: 93, high: 100 });
  });

  it("resolves a quiet-window timestamp through the service without calling the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const reader = createTimelineReader(quietWindow.ledgers);
    const report = await explainCongestion(
      { network: "stellar-pubnet", atTime: "2026-04-01T00:00:07.000Z", radius: 0 },
      reader,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(report.window).toMatchObject({ fromSequence: 101, toSequence: 101, focusSequence: 101 });
    expect(report.lookup?.matchedSequence).toBe(101);
    expect(report.lookup?.note).toContain("2026-04-01T00:00:07.000Z");
    expect(report.fees.sorobanResource.p50).toBe("5000");
    fetchSpy.mockRestore();
  });
});
