import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { consistentFixture, driftedFixture, unavailableFixture, unknownLayoutFixture } from "./fixtures";

vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));

vi.mock("@/server/research/soroban-pool-history/eventReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/soroban-pool-history/eventReader")>();
  const {
    consistentFixture: consistent,
    driftedFixture: drifted,
    unknownLayoutFixture: unknown,
    unavailableFixture: unavailable,
    depsFor,
  } = await import("./fixtures");

  return {
    ...actual,
    readPoolEvents: async (
      network: "stellar-testnet" | "stellar-pubnet",
      poolId: string,
      fromLedger: number,
      toLedger: number,
    ) => {
      if (poolId === unavailable.pool_id && fromLedger === 99) {
        return { status: "unavailable", reason: unavailable.reason };
      }
      const fixture = [consistent, drifted, unknown].find((entry) => entry.pool_id === poolId);
      if (!fixture) return { status: "missing" };
      return depsFor(fixture).readEvents(network, poolId, fromLedger, toLedger);
    },
  };
});

const { POST } = await import("@/app/api/insights/soroban-pool-history/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/soroban-pool-history", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/soroban-pool-history", () => {
  it("returns a no-store consistent report", async () => {
    const response = await POST(
      post({
        poolId: consistentFixture.pool_id,
        network: "stellar-testnet",
        fromLedger: consistentFixture.from_ledger,
        toLedger: consistentFixture.to_ledger,
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.drift.matched).toBe(true);
    expect(payload.report.readOnly).toBe(true);
  });

  it("returns drift and unsupported layouts", async () => {
    const drift = await POST(
      post({
        poolId: driftedFixture.pool_id,
        network: "stellar-testnet",
        fromLedger: driftedFixture.from_ledger,
        toLedger: driftedFixture.to_ledger,
      }),
    );
    expect((await drift.json()).report.drift.matched).toBe(false);

    const unknown = await POST(
      post({
        poolId: unknownLayoutFixture.pool_id,
        network: "stellar-testnet",
        fromLedger: unknownLayoutFixture.from_ledger,
        toLedger: unknownLayoutFixture.to_ledger,
      }),
    );
    expect((await unknown.json()).report.state).toBe("unsupported");
  });

  it("returns 503 when the provider is unavailable", async () => {
    const response = await POST(
      post({
        poolId: unavailableFixture.pool_id,
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
              poolId: consistentFixture.pool_id,
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
          poolId: consistentFixture.pool_id,
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
