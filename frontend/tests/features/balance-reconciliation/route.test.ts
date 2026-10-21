import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feeBumpFixture, matchedFixture, unavailableFixture, unexplainedFixture } from "./fixtures";

vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));

vi.mock("@/server/research/balance-reconciliation/effectReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/balance-reconciliation/effectReader")>();
  const { matchedFixture: matched, unexplainedFixture: unexplained, feeBumpFixture: feeBump, unavailableFixture: unavailable, depsFor } = await import("./fixtures");

  return {
    ...actual,
    readAccountHistory: async (network: "stellar-testnet" | "stellar-pubnet", account: string) => {
      if (account === unavailable.account) return { status: "unavailable", reason: unavailable.reason };
      const fixture = [matched, unexplained, feeBump].find((entry) => entry.account === account);
      if (!fixture) return { status: "missing" };
      return depsFor(fixture).readHistory(network, account, fixture.from_ledger, fixture.to_ledger);
    },
  };
});

const { POST } = await import("@/app/api/insights/balance-reconciliation/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/balance-reconciliation", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/balance-reconciliation", () => {
  it("returns a no-store match", async () => {
    const response = await POST(post({ account: matchedFixture.account, network: "stellar-testnet", fromLedger: 10, toLedger: 20 }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.matched).toBe(true);
    expect(payload.report.pricesConverted).toBe(false);
  });

  it("returns the unexplained delta and a sponsor fee", async () => {
    const delta = await POST(post({ account: unexplainedFixture.account, network: "stellar-testnet", fromLedger: 10, toLedger: 20 }));
    expect((await delta.json()).report.reconciliation[0].deltaStroops).toBe("2");
    const sponsor = await POST(post({ account: feeBumpFixture.account, network: "stellar-testnet", fromLedger: 10, toLedger: 20 }));
    expect((await sponsor.json()).report.timeline[0].stroops).toBe("-300");
  });

  it("returns 503 when the provider is unavailable", async () => {
    const response = await POST(post({ account: unavailableFixture.account, network: "stellar-testnet", fromLedger: 10, toLedger: 20 }));
    expect(response.status).toBe(503);
    expect((await response.json()).report.state).toBe("unavailable");
  });

  it("rejects invalid JSON, inverted windows, and oversized bodies", async () => {
    expect((await (await POST(post("{"))).json()).error).toBe("invalid_json");
    expect((await (await POST(post({ account: matchedFixture.account, network: "stellar-testnet", fromLedger: 20, toLedger: 10 }))).json()).error).toBe("invalid_request");
    const oversized = await POST(post({ account: matchedFixture.account, network: "stellar-testnet", fromLedger: 10, toLedger: 20 }, { "content-length": "999999" }));
    expect(oversized.status).toBe(413);
  });
});
