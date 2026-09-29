import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FULL_WORLD, request } from "./fixtures";

vi.mock("@/server/research/vesting-unlock/reader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/vesting-unlock/reader")>();

  return {
    ...actual,
    createProductionReader: () => actual.createFixtureReader(FULL_WORLD),
  };
});

vi.mock("@/server/security/rateLimit", () => ({
  checkRateLimit: () => null,
}));

const { POST } = await import("@/app/api/insights/vesting-unlock/route");

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/insights/vesting-unlock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/insights/vesting-unlock", () => {
  it("returns a report for supported cliff evidence", async () => {
    const response = await POST(post(request()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.tranches).toHaveLength(1);
    expect(payload.report.readOnly).toBe(true);
    expect(payload.report.claimAndScheduleUnchanged).toBe(true);
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(post("{"));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_json");
  });

  it("rejects invalid requests before reading sources", async () => {
    const response = await POST(
      post({
        network: "ethereum",
        chainFamily: "evm",
        sources: [],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("invalid_request");
  });

  it("returns 503 when every source is unsupported", async () => {
    const response = await POST(
      post(
        request({
          sources: [{ kind: "evm_vesting_contract", id: "0xarbitrary", network: "ethereum" }],
        }),
      ),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect((await response.json()).report.coverage.state).toBe("unavailable");
  });

  it("rejects oversized declared payloads", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/insights/vesting-unlock", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "999999999" },
        body: JSON.stringify(request()),
      }),
    );

    expect(response.status).toBe(413);
  });
});
