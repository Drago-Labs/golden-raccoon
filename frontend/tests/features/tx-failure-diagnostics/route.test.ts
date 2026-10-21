import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feeBumpFixture, unavailableFixture, underfundedFixture } from "./fixtures";

vi.mock("@/server/security/rateLimit", () => ({
  checkRateLimit: () => null,
}));

vi.mock("@/server/research/tx-failure-diagnostics/transactionReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/tx-failure-diagnostics/transactionReader")>();
  const { underfundedFixture: underfunded, feeBumpFixture: feeBump, badSequenceFixture: badSequence } = await import("./fixtures");
  const fixtures = [underfunded, feeBump, badSequence];

  return {
    ...actual,
    readRecordedTransaction: async (_network: string, hash: string) => {
      if (hash === "a".repeat(64)) return { status: "unavailable", reason: unavailableFixture.reason };
      const fixture = fixtures.find((entry) => entry.hash === hash);
      if (!fixture) return { status: "missing" };
      return {
        status: "ok",
        value: {
          hash: fixture.hash,
          ledger: fixture.ledger,
          envelopeXdr: fixture.envelope_xdr,
          resultXdr: fixture.result_xdr,
          sourceAccount: fixture.source_account,
          feeSource: fixture.fee_source ?? null,
        },
      };
    },
    readAccountSnapshot: async (_network: string, accountId: string) => {
      const fixture = fixtures.find((entry) => entry.account?.id === accountId);
      if (!fixture?.account) return { status: "missing" };
      return { status: "ok", value: fixture.account };
    },
  };
});

const { POST } = await import("@/app/api/insights/tx-failure-diagnostics/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/tx-failure-diagnostics", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/tx-failure-diagnostics", () => {
  it("returns a no-store diagnosis for a recorded failure", async () => {
    const response = await POST(post({ hash: underfundedFixture.hash, network: "stellar-testnet" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.transactionCode).toBe("tx_failed");
    expect(payload.report.signsOrRetries).toBe(false);
  });

  it("returns 503 when the provider is unavailable", async () => {
    const response = await POST(post({ hash: "a".repeat(64), network: "stellar-testnet" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect((await response.json()).report.state).toBe("unavailable");
  });

  it("returns a partial fee-bump report without guessing account state", async () => {
    const response = await POST(post({ hash: feeBumpFixture.hash, network: "stellar-testnet" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.state).toBe("partial");
    expect(payload.report.feeBump.outerCode).toBe("tx_fee_bump_inner_failed");
  });

  it("rejects invalid JSON and invalid hashes", async () => {
    const invalidJson = await POST(post("{"));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error).toBe("invalid_json");

    const invalidHash = await POST(post({ hash: "nope", network: "stellar-testnet" }));
    expect(invalidHash.status).toBe(400);
    expect((await invalidHash.json()).error).toBe("invalid_request");
  });

  it("rejects an oversized declared payload", async () => {
    const response = await POST(post({ hash: underfundedFixture.hash, network: "stellar-testnet" }, { "content-length": "999999" }));
    expect(response.status).toBe(413);
  });
});
