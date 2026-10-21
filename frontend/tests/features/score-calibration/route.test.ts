import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { request } from "./fixtures";

const state = vi.hoisted(() => ({ hasSnapshots: true }));

vi.mock("@/server/research/score-calibration/snapshotReader", () => ({
  readScoreSnapshots: () =>
    state.hasSnapshots ? [{ snapshotId: "s1", assetKey: "USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN", assetLabel: "USDX", score: 10, publishedAt: "2020-01-01T00:00:00.000Z" }] : [],
}));

vi.mock("@/server/research/score-calibration/outcomeDetection", () => ({
  detectLargeDrawdown: async () => ({ outcome: "did_not_occur" }),
  detectDepeg: () => ({ outcome: "unsupported", reason: "outcome_not_configured", issues: [] }),
  detectIncident: () => ({ outcome: "unsupported", reason: "outcome_not_configured", issues: [] }),
}));

const { POST } = await import("@/app/api/insights/score-calibration/route");

function post(body: unknown): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost/api/insights/score-calibration", { method: "POST", headers: { "content-type": "application/json" }, body: payload });
}

describe("POST /api/insights/score-calibration", () => {
  it("returns a report for a valid request", async () => {
    state.hasSnapshots = true;
    const response = await POST(post(request()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.scoringModelUnchanged).toBe(true);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 for an invalid horizon", async () => {
    const response = await POST(post(request({ horizonDays: 14 })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_request");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(post("not json"));
    expect(response.status).toBe(400);
  });

  it("returns 413 for an oversized payload", async () => {
    const response = await POST(post(request({ padding: "x".repeat(10_000) })));
    expect(response.status).toBe(413);
  });

  it("returns empty coverage when there is no history for the network", async () => {
    state.hasSnapshots = false;
    const response = await POST(post(request()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.coverage.state).toBe("empty");
  });
});
