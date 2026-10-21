import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HolderDistributionReader } from "@/server/research/stellar-holders/schema";
import {
  ISSUER_A,
  ISSUER_B,
  PUB_A,
  PUB_B,
  concentrated,
  readerFromFixture,
} from "./fixtures";

const readerBox = vi.hoisted(() => ({ current: null as HolderDistributionReader | null }));

vi.mock("@/server/security/rateLimit", () => ({
  checkRateLimit: () => null,
}));

vi.mock("@/server/research/stellar-holders/holderReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/stellar-holders/holderReader")>();

  return {
    ...actual,
    createHorizonHolderReader: () => {
      if (!readerBox.current) throw new Error("Test reader was not installed.");

      return readerBox.current;
    },
  };
});

const { POST } = await import("@/app/api/insights/stellar-holders/route");

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/stellar-holders", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  readerBox.current = readerFromFixture(concentrated);
});

describe("POST /api/insights/stellar-holders", () => {
  it("returns the fixture report and does not cache it", async () => {
    const response = await POST(post({ asset: concentrated.asset, network: "stellar-testnet" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.asset.resultKey).toBe(`stellar-testnet|CONC|${ISSUER_A}`);
    expect(payload.report.concentration.accounts.gini).toEqual({ numerator: "3", denominator: "8" });
    expect(payload.report.readOnly).toBe(true);
  });

  it("rejects malformed JSON, a missing asset, a bad network, and a bad asset", async () => {
    const malformed = await POST(post("{not json"));
    const missing = await POST(post({ network: "stellar-testnet" }));
    const network = await POST(post({ asset: concentrated.asset, network: "ethereum" }));
    const asset = await POST(post({ asset: "USDC", network: "stellar-testnet" }));

    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "invalid_json" });
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({ error: "invalid_request" });
    expect(network.status).toBe(400);
    await expect(network.json()).resolves.toMatchObject({ error: "unsupported_network" });
    expect(asset.status).toBe(400);
    await expect(asset.json()).resolves.toMatchObject({ error: "invalid_asset" });
  });

  it("rejects a body above the published byte limit", async () => {
    const response = await POST(post({ asset: "A".repeat(20_000), network: "stellar-testnet" }));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: "payload_too_large" });
  });

  it("does not return one issuer's holders for another issuer with the same code", async () => {
    readerBox.current = {
      async readSupply(asset) {
        const issuerB = asset.issuer === ISSUER_B;

        return {
          ledger: issuerB ? 2 : 1,
          ledgerClosedAt: null,
          issued: issuerB ? "1.0000000" : "70.0000000",
          authorized: issuerB ? "1.0000000" : "70.0000000",
          authorizedToMaintainLiabilities: "0.0000000",
          unauthorized: "0.0000000",
          liquidityPools: "0.0000000",
          claimableBalances: "0.0000000",
          contracts: "0.0000000",
          numAccounts: 1,
        };
      },
      async readTrustlinePage(asset) {
        return {
          records: [{ accountId: asset.issuer === ISSUER_B ? PUB_B : PUB_A, balance: asset.issuer === ISSUER_B ? "1.0000000" : "70.0000000" }],
          nextCursor: null,
        };
      },
      async readLiquidityPools() {
        return { records: [], truncated: false };
      },
      async readClaimableBalances() {
        return { records: [], truncated: false };
      },
      async readDistributionAccounts() {
        return { accounts: [], tomlRead: true };
      },
    };

    const first = await POST(post({ asset: `TWIN:${ISSUER_A}`, network: "stellar-testnet" }));
    const second = await POST(post({ asset: `TWIN:${ISSUER_B}`, network: "stellar-testnet" }));
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.report.holders.map((holder: { accountId: string }) => holder.accountId)).toEqual([PUB_A]);
    expect(secondBody.report.holders.map((holder: { accountId: string }) => holder.accountId)).toEqual([PUB_B]);
    expect(firstBody.report.asset.resultKey).not.toBe(secondBody.report.asset.resultKey);
  });
});
