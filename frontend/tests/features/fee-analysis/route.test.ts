import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionRecord } from "@/server/types";
import {
  EVM_FAILED,
  EVM_OTHER_WALLET,
  EVM_REPLACED,
  EVM_REPLACEMENT,
  EVM_SUCCESS,
  FULL_WORLD,
  STELLAR_FEE_BUMP,
  STELLAR_FEE_PAYER,
  STELLAR_SOURCE,
  WALLET,
  request,
} from "./fixtures";

/**
 * The route reads from storage and from the chain sources. Both are replaced
 * here: storage with a fixture list scoped by wallet, and the sources with the
 * fixture world, so the route test covers request handling and wallet scoping
 * without a database or a network.
 */
const storedRecords = vi.hoisted(() => ({ value: [] as TransactionRecord[] }));

vi.mock("@/server/storage", () => ({
  listTransactionRecords: (walletAddress?: string) =>
    storedRecords.value.filter(
      (record) =>
        !walletAddress ||
        (record.walletAddress ?? record.sourceAccount ?? "").toLowerCase() === walletAddress.toLowerCase() ||
        record.chainFamily === "stellar",
    ),
}));

vi.mock("@/server/research/fee-analysis/evmReceipt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/fee-analysis/evmReceipt")>();

  return {
    ...actual,
    createEvmReceiptSource: () => async ({ hash }: { hash: string }) => {
      const entry = FULL_WORLD.receipts?.[hash];

      if (!entry || entry instanceof Error) throw new Error(`No receipt for ${hash}.`);

      return entry;
    },
  };
});

vi.mock("@/server/research/fee-analysis/stellarMeta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/fee-analysis/stellarMeta")>();

  return {
    ...actual,
    createStellarMetaSource: () => async ({ hash }: { hash: string }) => {
      const entry = FULL_WORLD.meta?.[hash];

      if (!entry || entry instanceof Error) throw new Error(`No metadata for ${hash}.`);

      return entry;
    },
  };
});

const { POST } = await import("@/app/api/insights/fee-analysis/route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/insights/fee-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  storedRecords.value = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/insights/fee-analysis", () => {
  it("returns a report for the requested wallet", async () => {
    storedRecords.value = [EVM_SUCCESS, EVM_FAILED];

    const response = await POST(post(request()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.charges).toHaveLength(2);
    expect(payload.report.walletAddress).toBe(WALLET);
  });

  it("never returns another wallet's charge", async () => {
    storedRecords.value = [EVM_SUCCESS, EVM_OTHER_WALLET];

    const response = await POST(post(request()));
    const payload = await response.json();

    expect(payload.report.charges.map((charge: { hash: string }) => charge.hash)).toEqual(["0xaaa1"]);
  });

  it("counts a replaced transaction once", async () => {
    storedRecords.value = [EVM_REPLACED, EVM_REPLACEMENT];

    const response = await POST(post(request()));
    const payload = await response.json();

    expect(payload.report.charges).toHaveLength(1);
    expect(payload.report.excluded[0].reason).toBe("superseded_by_replacement");
  });

  it("shows the fee-bump payer separately from the source", async () => {
    storedRecords.value = [STELLAR_FEE_BUMP];

    const response = await POST(post(request()));
    const payload = await response.json();

    expect(payload.report.charges[0].feeBumpPayer).toBe(STELLAR_FEE_PAYER);
    expect(payload.report.charges[0].originalSource).toBe(STELLAR_SOURCE);
  });

  it("declares that it changed nothing", async () => {
    storedRecords.value = [EVM_SUCCESS];

    const response = await POST(post(request()));
    const payload = await response.json();

    expect(payload.report.readOnly).toBe(true);
    expect(payload.report.feePolicyUnchanged).toBe(true);
  });

  it("returns a successful empty report when the wallet has no records", async () => {
    const response = await POST(post(request()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("rejects a request with no wallet address", async () => {
    const response = await POST(post({ from: "2026-02-01T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects a window longer than the published limit", async () => {
    const response = await POST(post(request({ from: "2020-01-01T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "window_too_large" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });
});
