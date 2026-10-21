import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deletedFixture, textFixture, unavailableFixture } from "./fixtures";

vi.mock("@/server/security/rateLimit", () => ({
  checkRateLimit: () => null,
}));

vi.mock("@/server/research/account-data-entries/entryReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/account-data-entries/entryReader")>();
  const { textFixture: text, binaryFixture: binary, deletedFixture: deleted, unavailableFixture: unavailable } = await import("./fixtures");
  const fixtures = [text, binary, deleted];

  return {
    ...actual,
    readAccountRecord: async (_network: string, account: string) => {
      if (account === unavailable.account_id) return { status: "unavailable", reason: unavailable.reason };
      const fixture = fixtures.find((entry) => entry.account.id === account);
      if (!fixture) return { status: "missing" };
      return {
        status: "ok",
        value: { id: fixture.account.id, data: fixture.account.data, observationLedger: fixture.account.last_modified_ledger },
      };
    },
    readManageDataHistory: async (_network: string, account: string) => {
      const fixture = fixtures.find((entry) => entry.account.id === account);
      if (!fixture) return { status: "missing" };
      return {
        status: "ok",
        value: {
          operations: fixture.operations
            .filter((operation) => operation.type === "manage_data" && operation.name)
            .map((operation) => ({
              id: operation.id,
              pagingToken: operation.paging_token,
              key: operation.name,
              valueBase64: operation.value,
              sourceAccount: operation.source_account,
              ledger: operation.ledger,
            })),
          truncated: fixture.truncated,
          oldestLedger: fixture.oldest_ledger ?? Math.min(...fixture.operations.map((operation) => operation.ledger)),
        },
      };
    },
  };
});

const { POST } = await import("@/app/api/insights/account-data-entries/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/account-data-entries", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/account-data-entries", () => {
  it("returns a no-store report for recorded text entries", async () => {
    const response = await POST(post({ account: textFixture.account.id, network: "stellar-testnet" }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.writesEntries).toBe(false);
    expect(payload.report.entries.some((entry: { key: string; utf8: string | null }) => entry.key === "config" && entry.utf8 === "hello")).toBe(true);
  });

  it("returns 503 when the account provider is unavailable", async () => {
    const response = await POST(post({ account: unavailableFixture.account_id, network: "stellar-testnet" }));
    expect(response.status).toBe(503);
    expect((await response.json()).report.state).toBe("unavailable");
  });

  it("returns a partial report for a deleted key", async () => {
    const response = await POST(post({ account: deletedFixture.account.id, network: "stellar-testnet" }));
    const payload = await response.json();
    expect(payload.report.state).toBe("partial");
    expect(payload.report.oldestLedger).toBe(10);
  });

  it("rejects invalid JSON, invalid accounts, and oversized bodies", async () => {
    expect((await (await POST(post("{"))).json()).error).toBe("invalid_json");
    expect((await (await POST(post({ account: "nope", network: "stellar-testnet" }))).json()).error).toBe("invalid_request");
    const oversized = await POST(
      post({ account: textFixture.account.id, network: "stellar-testnet" }, { "content-length": "999999" }),
    );
    expect(oversized.status).toBe(413);
  });
});
