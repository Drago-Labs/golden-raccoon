import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feeBumpFixture, unavailableFixture, validNowFixture } from "./fixtures";

vi.mock("@/server/security/rateLimit", () => ({
  checkRateLimit: () => null,
}));

vi.mock("@/server/research/tx-preconditions/ledgerState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/tx-preconditions/ledgerState")>();
  const { validNowFixture: validNow, feeBumpFixture: feeBump, expiredBoundsFixture, futureSequenceFixture } =
    await import("./fixtures");
  const fixtures = [validNow, feeBump, expiredBoundsFixture, futureSequenceFixture];

  return {
    ...actual,
    readCurrentLedger: async () => {
      const fixture = fixtures[0];
      if (!fixture) return { status: "unavailable", reason: unavailableFixture.reason };
      return {
        status: "ok",
        value: {
          ledger: fixture.ledger,
          closeTime: fixture.closed_at,
          closeTimeUnix: Math.floor(Date.parse(fixture.closed_at) / 1000),
        },
      };
    },
    readAccountState: async (_network: string, accountId: string) => {
      const fixture = fixtures.find((entry) => entry.account?.id === accountId);
      if (!fixture?.account) return { status: "missing" };
      return {
        status: "ok",
        value: {
          id: fixture.account.id,
          sequence: fixture.account.sequence,
          sequenceTimeUnix: Number(fixture.account.sequence_time),
          sequenceLedger: fixture.account.sequence_ledger,
        },
      };
    },
  };
});

const { POST } = await import("@/app/api/insights/tx-preconditions/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/tx-preconditions", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/tx-preconditions", () => {
  it("returns a no-store report for a decoded envelope", async () => {
    const response = await POST(
      post({
        envelopeXdr: validNowFixture.envelope_xdr,
        network: "stellar-testnet",
        evaluatedAt: validNowFixture.evaluated_at,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.signsOrSubmits).toBe(false);
    expect(payload.report.envelope.sourceAccount).toBe(validNowFixture.account?.id);
  });

  it("returns a fee-bump report with the fee source", async () => {
    const response = await POST(
      post({
        envelopeXdr: feeBumpFixture.envelope_xdr,
        network: "stellar-testnet",
        evaluatedAt: feeBumpFixture.evaluated_at,
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.envelope.isFeeBump).toBe(true);
    expect(payload.report.envelope.feeSource).toBe(feeBumpFixture.fee_source);
  });

  it("rejects invalid JSON and invalid envelopes", async () => {
    const invalidJson = await POST(post("{"));
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error).toBe("invalid_json");

    const invalidXdr = await POST(post({ envelopeXdr: "not-xdr", network: "stellar-testnet" }));
    expect(invalidXdr.status).toBe(400);
    expect((await invalidXdr.json()).error).toBe("invalid_xdr");
  });

  it("rejects an oversized declared payload", async () => {
    const response = await POST(
      post(
        { envelopeXdr: validNowFixture.envelope_xdr, network: "stellar-testnet" },
        { "content-length": "999999" },
      ),
    );
    expect(response.status).toBe(413);
  });
});
