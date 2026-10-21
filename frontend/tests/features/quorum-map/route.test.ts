import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mainnetFixture, unavailableFixture } from "./fixtures";

vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));

vi.mock("@/server/research/quorum-map/validatorSource", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/quorum-map/validatorSource")>();
  const { mainnetFixture: mainnet, nestedFixture: nested, mismatchFixture: mismatch, unavailableFixture: unavailable, snapshotFrom } = await import("./fixtures");
  const fixtures = [mainnet, nested, mismatch];
  return {
    ...actual,
    readValidatorSnapshot: async (network: "stellar-testnet" | "stellar-pubnet") => {
      if (network === "stellar-testnet") return { status: "unavailable", reason: unavailable.reason };
      const fixture = fixtures.find((entry) => entry.network === network);
      if (!fixture) return { status: "unavailable", reason: unavailable.reason };
      return { status: "ok", value: snapshotFrom(fixture) };
    },
  };
});

const { POST } = await import("@/app/api/insights/quorum-map/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/quorum-map", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/quorum-map", () => {
  it("returns a no-store report that does not prove safety", async () => {
    const response = await POST(post({ network: mainnetFixture.network }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.provesSafety).toBe(false);
    expect(payload.report.coverageNotice).toMatch(/does not prove/);
  });

  it("returns 503 when the directory is unavailable", async () => {
    const response = await POST(post({ network: "stellar-testnet" }));
    expect(response.status).toBe(503);
    expect((await response.json()).report.state).toBe("unavailable");
    expect(unavailableFixture.reason).toMatch(/timeout/);
  });

  it("rejects invalid JSON, an invalid network, and an oversized body", async () => {
    expect((await (await POST(post("{"))).json()).error).toBe("invalid_json");
    expect((await (await POST(post({ network: "other" }))).json()).error).toBe("invalid_request");
    const oversized = await POST(post({ network: "stellar-pubnet" }, { "content-length": "999999" }));
    expect(oversized.status).toBe(413);
  });
});
