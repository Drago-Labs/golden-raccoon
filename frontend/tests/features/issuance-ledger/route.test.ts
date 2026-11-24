import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { burnHeavyFixture, reconciledFixture, unavailableFixture, unreconciledFixture } from "./fixtures";

vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));

vi.mock("@/server/research/issuance-ledger/issuerOperations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/issuance-ledger/issuerOperations")>();
  const {
    reconciledFixture: reconciled,
    unreconciledFixture: unreconciled,
    burnHeavyFixture: burnHeavy,
    unavailableFixture: unavailable,
    depsFor,
  } = await import("./fixtures");

  return {
    ...actual,
    readIssuerHistory: async (
      network: "stellar-testnet" | "stellar-pubnet",
      asset: { code: string; issuer: string },
      fromLedger: number,
      toLedger: number,
    ) => {
      if (asset.issuer === unavailable.issuer && asset.code === unavailable.asset_code && fromLedger === 99) {
        return { status: "unavailable", reason: unavailable.reason };
      }
      const fixture = [reconciled, unreconciled, burnHeavy].find(
        (entry) => entry.asset_code === asset.code && entry.issuer === asset.issuer,
      );
      if (!fixture) return { status: "missing" };
      return depsFor(fixture).readHistory(network, asset.code, asset.issuer, fromLedger, toLedger);
    },
  };
});

const { POST } = await import("@/app/api/insights/issuance-ledger/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/issuance-ledger", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/issuance-ledger", () => {
  it("returns a no-store reconciled report", async () => {
    const response = await POST(
      post({
        assetCode: reconciledFixture.asset_code,
        issuer: reconciledFixture.issuer,
        network: "stellar-testnet",
        fromLedger: 10,
        toLedger: 20,
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.reconciled).toBe(true);
    expect(payload.report.readOnly).toBe(true);
  });

  it("returns unreconciled deltas and a burn-heavy residual", async () => {
    const delta = await POST(
      post({
        assetCode: unreconciledFixture.asset_code,
        issuer: unreconciledFixture.issuer,
        network: "stellar-testnet",
        fromLedger: 10,
        toLedger: 20,
      }),
    );
    expect((await delta.json()).report.unreconciled[0].deltaStroops).toBe("2");

    const burns = await POST(
      post({
        assetCode: burnHeavyFixture.asset_code,
        issuer: burnHeavyFixture.issuer,
        network: "stellar-testnet",
        fromLedger: 10,
        toLedger: 30,
      }),
    );
    expect((await burns.json()).report.reconstructedSupplyStroops).toBe("10000000");
  });

  it("returns 503 when the provider is unavailable", async () => {
    const response = await POST(
      post({
        assetCode: unavailableFixture.asset_code,
        issuer: unavailableFixture.issuer,
        network: "stellar-testnet",
        fromLedger: 99,
        toLedger: 100,
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).report.state).toBe("unavailable");
  });

  it("rejects invalid JSON, inverted windows, and oversized bodies", async () => {
    expect((await (await POST(post("{"))).json()).error).toBe("invalid_json");
    expect(
      (
        await (
          await POST(
            post({
              assetCode: reconciledFixture.asset_code,
              issuer: reconciledFixture.issuer,
              network: "stellar-testnet",
              fromLedger: 20,
              toLedger: 10,
            }),
          )
        ).json()
      ).error,
    ).toBe("invalid_request");
    const oversized = await POST(
      post(
        {
          assetCode: reconciledFixture.asset_code,
          issuer: reconciledFixture.issuer,
          network: "stellar-testnet",
          fromLedger: 10,
          toLedger: 20,
        },
        { "content-length": "999999" },
      ),
    );
    expect(oversized.status).toBe(413);
  });
});
