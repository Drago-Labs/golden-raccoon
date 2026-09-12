import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_RECORDS, addedRemovedAmbiguousPair, expiredRecord, reorderedEquivalentPair, revokedRecord, stubAdapter } from "./fixtures";

// The route resolves its own adapter, so the storage layer is stubbed at the
// module boundary rather than threaded through the handler signature.
vi.mock("@/server/snapshots/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/snapshots/store")>();
  const adapter = stubAdapter(ALL_RECORDS);

  return {
    ...actual,
    readRiskSnapshot: (id: string) => actual.readRiskSnapshot(id, adapter),
  };
});

const { GET } = await import("@/app/api/insights/report-comparison/route");

function get(params: Record<string, string>): NextRequest {
  const query = new URLSearchParams(params).toString();
  return new NextRequest(`http://localhost/api/insights/report-comparison?${query}`);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/insights/report-comparison", () => {
  it("returns a comparison for a readable pair", async () => {
    const response = await GET(get({ leftId: reorderedEquivalentPair.left.id, rightId: reorderedEquivalentPair.right.id }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.comparison.materiallyIdentical).toBe(true);
  });

  it("surfaces a lost source in the payload", async () => {
    const response = await GET(get({ leftId: addedRemovedAmbiguousPair.left.id, rightId: addedRemovedAmbiguousPair.right.id }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.comparison.coverage.lostSources).toBeGreaterThan(0);
  });

  it("fails closed on a revoked snapshot", async () => {
    const response = await GET(get({ leftId: reorderedEquivalentPair.left.id, rightId: revokedRecord.id }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "revoked", side: "right" });
  });

  it("fails closed on an expired snapshot", async () => {
    const response = await GET(get({ leftId: reorderedEquivalentPair.left.id, rightId: expiredRecord.id }));

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ error: "expired" });
  });

  it("rejects a missing parameter", async () => {
    const response = await GET(get({ leftId: reorderedEquivalentPair.left.id }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects an id that is not shaped like a snapshot id", async () => {
    const response = await GET(get({ leftId: "../../secret", rightId: reorderedEquivalentPair.right.id }));

    expect(response.status).toBe(400);
  });

  it("never sets a cacheable response header", async () => {
    const response = await GET(get({ leftId: reorderedEquivalentPair.left.id, rightId: revokedRecord.id }));

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
