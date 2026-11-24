import { afterEach, describe, expect, it, vi } from "vitest";
import { StablecoinFlowError } from "@/server/research/stablecoin-flows/errors";
import { readEvmFlowEvents, TRANSFER_TOPIC, ZERO_TOPIC } from "@/server/research/stablecoin-flows/evmEvents";
import {
  decimalFromUnits,
  normalizeEvmEvent,
  normalizeStellarPayment,
  parseIntegerAmount,
  parseStellarAmount,
  scaleUnits,
  sortEvents,
  type RawEvmFlowEvent,
} from "@/server/research/stablecoin-flows/normalization";
import { stablecoinFlowRequestSchema } from "@/server/research/stablecoin-flows/schema";
import { readStellarFlowEvents } from "@/server/research/stablecoin-flows/stellarEvents";
import {
  clone,
  deployment,
  EVM_RPC,
  fixtures,
  flowRequest,
  HORIZON,
  recordedFetch,
  stellarDeployment,
  TOPIC_FILTERS,
  usdc,
  window_,
} from "./fixtures";

afterEach(() => vi.restoreAllMocks());

describe("scale and amount parsing", () => {
  it("upscales exactly to the asset's canonical scale", () => {
    // USDC is six decimals on EVM and seven on Stellar, so the canonical scale is seven.
    expect(scaleUnits(1_000_000n, 6, 7)).toBe(10_000_000n);
    expect(scaleUnits(10_000_000n, 7, 7)).toBe(10_000_000n);
  });

  it("refuses to rescale downwards, which would drop digits", () => {
    expect(() => scaleUnits(10_000_000n, 7, 6)).toThrowError(/would drop digits/);
  });

  it("renders units as a decimal string without trailing zeros", () => {
    expect(decimalFromUnits(10_000_000_000_000n, 7)).toBe("1000000");
    expect(decimalFromUnits(1_500_000n, 7)).toBe("0.15");
    expect(decimalFromUnits(-10_000_000n, 7)).toBe("-1");
    expect(decimalFromUnits(0n, 7)).toBe("0");
  });

  it("accepts hex and decimal integers and nothing else", () => {
    expect(parseIntegerAmount("0x0f4240")).toBe(1_000_000n);
    expect(parseIntegerAmount("1000000")).toBe(1_000_000n);
    expect(() => parseIntegerAmount("1e6")).toThrowError(StablecoinFlowError);
    expect(() => parseIntegerAmount("-1")).toThrowError(/usable integer amount/);
  });

  it("parses Stellar seven-decimal amounts into integer units", () => {
    expect(parseStellarAmount("50000.0000000")).toBe(500_000_000_000n);
    expect(parseStellarAmount("0.0000001")).toBe(1n);
    expect(() => parseStellarAmount("1.12345678")).toThrowError(/usable Stellar amount/);
  });
});

describe("normalizing an EVM mint or burn", () => {
  const raw: RawEvmFlowEvent = {
    direction: "mint",
    amount: "0x00000000000000000000000000000000000000000000000000000000e8d4a51000",
    blockNumber: 22_987_400,
    blockTimestamp: Date.parse("2026-11-18T06:00:00Z") / 1000,
    txHash: `0x${"a".repeat(64)}`,
    logIndex: 12,
  };

  it("states the amount in the canonical scale, the UTC day and the explorer link", () => {
    const event = normalizeEvmEvent(raw, deployment("ethereum"), usdc());
    expect(event).toEqual({
      chain: "ethereum",
      direction: "mint",
      amountUnits: "10000000000000",
      amount: "1000000",
      at: "2026-11-18T06:00:00.000Z",
      day: "2026-11-18",
      txId: `0x${"a".repeat(64)}`,
      txUrl: `https://etherscan.io/tx/0x${"a".repeat(64)}`,
      source: `ethereum eth_getLogs on ${deployment("ethereum").address}`,
    });
  });

  it("refuses an event with no usable block time, hash or amount", () => {
    expect(() => normalizeEvmEvent({ ...raw, blockTimestamp: 0 }, deployment("ethereum"), usdc())).toThrowError(
      /no usable timestamp/,
    );
    expect(() => normalizeEvmEvent({ ...raw, txHash: "0xshort" }, deployment("ethereum"), usdc())).toThrowError(
      /usable transaction hash/,
    );
    expect(() => normalizeEvmEvent({ ...raw, amount: "0x0" }, deployment("ethereum"), usdc())).toThrowError(
      /zero or less/,
    );
  });
});

describe("normalizing a Horizon payment", () => {
  const issuer = stellarDeployment();

  it("counts value leaving the issuer as a mint and value returning as a burn", () => {
    const records = clone(fixtures.singleChain.stellar.records) as Array<Record<string, unknown>>;
    const mint = normalizeStellarPayment(records[0] as never, issuer, usdc());
    expect(mint).toMatchObject({ chain: "stellar", direction: "mint", amount: "10000", day: "2026-11-19" });

    const burn = normalizeStellarPayment(
      { ...(records[0] as never), from: "GBXYZ", to: issuer.issuer, id: "x" } as never,
      issuer,
      usdc(),
    );
    expect(burn).toMatchObject({ direction: "burn", amount: "10000" });
  });

  it("drops anything that is not this issuer's own asset movement", () => {
    const records = clone(fixtures.singleChain.stellar.records) as Array<Record<string, unknown>>;
    const notPayments = records.filter((record) => record.type !== "payment");
    const otherAsset = records.find((record) => record.asset_code === "EURC");
    const thirdParty = records.find(
      (record) => record.asset_code === "USDC" && record.from !== issuer.issuer && record.to !== issuer.issuer,
    );
    expect(notPayments.length).toBeGreaterThan(0);
    for (const record of [...notPayments, otherAsset, thirdParty]) {
      expect(normalizeStellarPayment(record as never, issuer, usdc())).toBeNull();
    }
  });

  it("refuses a payment with no amount or time", () => {
    const records = clone(fixtures.singleChain.stellar.records) as Array<Record<string, unknown>>;
    expect(() =>
      normalizeStellarPayment({ ...(records[0] as never), amount: undefined } as never, issuer, usdc()),
    ).toThrowError(/missing its amount or time/);
  });
});

describe("readEvmFlowEvents", () => {
  it("asks for the mint and burn topic filters and returns what the chain recorded", async () => {
    const fetchMock = recordedFetch(clone(fixtures.multiChain), { chainOf: () => "ethereum" });
    vi.stubGlobal("fetch", fetchMock);

    const read = await readEvmFlowEvents(EVM_RPC, deployment("ethereum"), window_());
    expect(read.truncated).toBe(false);
    expect(read.coversWindowStart).toBe(true);
    expect(read.events.map((event) => event.direction)).toEqual(["mint", "burn", "burn"]);

    const filters = fetchMock.mock.calls
      .map(([, init]) => JSON.parse(String(init?.body)) as { method: string; params: unknown[] })
      .filter((body) => body.method === "eth_getLogs")
      .map((body) => (body.params[0] as { topics: Array<string | null> }).topics);
    expect(filters).toContainEqual([...TOPIC_FILTERS.mint]);
    expect(filters).toContainEqual([...TOPIC_FILTERS.burn]);
  });

  it("normalizes the recorded logs into hand-checkable amounts", async () => {
    vi.stubGlobal("fetch", recordedFetch(clone(fixtures.multiChain), { chainOf: () => "ethereum" }));
    const read = await readEvmFlowEvents(EVM_RPC, deployment("ethereum"), window_());
    const events = read.events.map((raw) => normalizeEvmEvent(raw, deployment("ethereum"), usdc()));
    expect(events.map((event) => [event.day, event.direction, event.amount])).toEqual([
      ["2026-11-18", "mint", "1000000"],
      ["2026-11-18", "burn", "250000"],
      ["2026-11-19", "burn", "400000"],
    ]);
  });

  it("reports a chain younger than the window as not covering its start", async () => {
    vi.stubGlobal("fetch", recordedFetch(clone(fixtures.partialCoverage), { chainOf: () => "base" }));
    const read = await readEvmFlowEvents(EVM_RPC, deployment("base"), window_());
    expect(read.coversWindowStart).toBe(false);
    expect(read.events).toHaveLength(1);
  });

  it("raises the provider's own failure rather than reporting an empty chain", async () => {
    vi.stubGlobal("fetch", recordedFetch(clone(fixtures.partialCoverage), { chainOf: () => "ethereum" }));
    await expect(readEvmFlowEvents(EVM_RPC, deployment("ethereum"), window_())).rejects.toThrowError(
      /more than 10000 results/,
    );
  });

  it("ignores a log that is neither a mint nor a burn", async () => {
    const fixture = clone(fixtures.multiChain);
    const [first] = fixture.evm.ethereum.logs;
    fixture.evm.ethereum.logs = [
      { ...first, topics: [TRANSFER_TOPIC, ZERO_TOPIC, ZERO_TOPIC] },
      { ...first, topics: [TRANSFER_TOPIC, `0x${"1".repeat(64)}`, `0x${"2".repeat(64)}`] },
    ];
    vi.stubGlobal("fetch", recordedFetch(fixture, { chainOf: () => "ethereum" }));
    const read = await readEvmFlowEvents(EVM_RPC, deployment("ethereum"), window_());
    expect(read.events).toEqual([]);
  });
});

describe("readStellarFlowEvents", () => {
  it("reads the issuer's payments and stops at the start of the window", async () => {
    vi.stubGlobal("fetch", recordedFetch(clone(fixtures.singleChain)));
    const read = await readStellarFlowEvents(HORIZON, stellarDeployment(), window_());
    expect(read.reachedWindowStart).toBe(true);
    expect(read.truncated).toBe(false);
    // The record older than the window is the stop signal, not a result.
    expect(read.payments.every((payment) => Date.parse(payment.created_at ?? "") >= Date.parse(window_().start))).toBe(
      true,
    );
    const events = read.payments
      .map((payment) => normalizeStellarPayment(payment, stellarDeployment(), usdc()))
      .filter((event) => event !== null);
    expect(events.map((event) => [event!.day, event!.direction, event!.amount])).toEqual([
      ["2026-11-19", "mint", "10000"],
      ["2026-11-18", "mint", "50000"],
    ]);
  });

  it("raises Horizon's own failure", async () => {
    vi.stubGlobal("fetch", recordedFetch(clone(fixtures.providerUnavailable)));
    await expect(readStellarFlowEvents(HORIZON, stellarDeployment(), window_())).rejects.toThrowError(/504/);
  });
});

describe("sortEvents", () => {
  it("orders newest first and breaks ties deterministically", async () => {
    vi.stubGlobal("fetch", recordedFetch(clone(fixtures.multiChain), { chainOf: () => "ethereum" }));
    const read = await readEvmFlowEvents(EVM_RPC, deployment("ethereum"), window_());
    const events = read.events.map((raw) => normalizeEvmEvent(raw, deployment("ethereum"), usdc()));
    expect(sortEvents([...events].reverse()).map((event) => event.at)).toEqual([
      "2026-11-19T12:00:00.000Z",
      "2026-11-18T18:00:00.000Z",
      "2026-11-18T06:00:00.000Z",
    ]);
  });
});

describe("request schema", () => {
  it("applies the documented defaults", () => {
    const parsed = stablecoinFlowRequestSchema.parse({
      assetId: "usdc",
      windowStart: "2026-11-18T00:00:00.000Z",
      windowEnd: "2026-11-20T00:00:00.000Z",
    });
    expect(parsed.chains).toEqual([]);
    expect(parsed.topEvents).toBe(10);
  });

  it("rejects a reversed window, an over-long window and a repeated chain", () => {
    expect(stablecoinFlowRequestSchema.safeParse(flowRequest({ windowEnd: "2026-11-17T00:00:00.000Z" })).success).toBe(
      false,
    );
    expect(stablecoinFlowRequestSchema.safeParse(flowRequest({ windowEnd: "2027-11-20T00:00:00.000Z" })).success).toBe(
      false,
    );
    expect(
      stablecoinFlowRequestSchema.safeParse(flowRequest({ chains: ["ethereum", "Ethereum"] })).success,
    ).toBe(false);
  });

  it("rejects a top-event count outside the ranked bound", () => {
    expect(stablecoinFlowRequestSchema.safeParse(flowRequest({ topEvents: 0 })).success).toBe(false);
    expect(stablecoinFlowRequestSchema.safeParse(flowRequest({ topEvents: 999 })).success).toBe(false);
  });
});
