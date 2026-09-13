import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/liquidity-depth/route";
import { LIQUIDITY_LIMITS } from "@/server/research/liquidity-depth/schema";
import { constantProductFeeAndRounding, crossedBook, orderbookMultipleLevels, staleTruncatedUnsupported } from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/liquidity-depth", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/liquidity-depth", () => {
  it("returns a report for a readable request", async () => {
    const response = await POST(post(orderbookMultipleLevels));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.informationalOnly).toBe(true);
  });

  it("returns the hand-calculated fill through the route", async () => {
    const response = await POST(post(orderbookMultipleLevels));
    const payload = await response.json();
    const rung = payload.report.venues[0].ladder.find(
      (entry: { requestedBaseAmount: string }) => entry.requestedBaseAmount === "1500000000",
    );

    expect(rung.quoteAmount).toBe("745000000");
  });

  it("returns the hand-calculated pool output through the route", async () => {
    const response = await POST(post(constantProductFeeAndRounding));
    const payload = await response.json();

    expect(payload.report.venues[0].ladder[0].quoteAmount).toBe("2988020943");
  });

  it("reports a crossed book as unavailable rather than failing the request", async () => {
    const response = await POST(post(crossedBook));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.venues[0].state).toBe("unavailable");
    expect(payload.report.venues[0].qualifications.join(" ")).toMatch(/crossed book/i);
  });

  it("reports stale, truncated and unsupported venues in coverage", async () => {
    const response = await POST(post(staleTruncatedUnsupported));
    const payload = await response.json();

    expect(payload.report.coverage.state).toBe("partial");
    expect(payload.report.coverage.unsupportedVenueCount).toBe(1);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects a ladder that is not strictly ascending", async () => {
    const response = await POST(post({ ...orderbookMultipleLevels, ladder: ["100", "100"] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "unsorted_ladder" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(
      post(orderbookMultipleLevels, { "content-length": String(LIQUIDITY_LIMITS.maxRequestBytes + 1) }),
    );

    expect(response.status).toBe(413);
  });
});
