import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { COMPARISON_LIMITS } from "@/server/research/run-comparison/schema";
import { POST, setRunReader } from "@/app/api/insights/run-comparison/route";
import {
  RUN_AMBIGUOUS_FINDINGS,
  RUN_EARLIER,
  RUN_OTHER_NETWORK,
  RUN_OTHER_WALLET,
  RUN_PROVIDER_OUTAGE,
  RUN_SINGLE_FINDING,
  createRunReader,
  request,
} from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/run-comparison", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  setRunReader(createRunReader());
});

afterEach(() => {
  setRunReader(null);
});

describe("POST /api/insights/run-comparison", () => {
  it("returns a comparison for two owned runs", async () => {
    const response = await POST(post(request(RUN_EARLIER.id, "run-later")));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.agentDifferences).toHaveLength(3);
  });

  it("answers 404 for another wallet's run without exposing it", async () => {
    const response = await POST(post(request(RUN_EARLIER.id, RUN_OTHER_WALLET.id)));
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).not.toContain("riskScore");
  });

  it("answers a real foreign id the same way as an invented one", async () => {
    const real = await POST(post(request(RUN_EARLIER.id, RUN_OTHER_WALLET.id)));
    const invented = await POST(post(request(RUN_EARLIER.id, "run-invented")));

    const realBody = await real.json();
    const inventedBody = await invented.json();

    // Status, code and message must not differ, because a difference would
    // tell the caller whether the id exists for somebody else. The echoed
    // `runId` is the caller's own input and reveals nothing.
    expect(real.status).toBe(invented.status);
    expect(realBody.error).toBe(inventedBody.error);
    expect(realBody.message).toBe(inventedBody.message);
    expect(realBody.details).toEqual({ runId: RUN_OTHER_WALLET.id });
    expect(inventedBody.details).toEqual({ runId: "run-invented" });
  });

  it("answers 409 for a cross-network pair", async () => {
    const response = await POST(post(request(RUN_EARLIER.id, RUN_OTHER_NETWORK.id)));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "cross_context" });
  });

  it("keeps a coverage drop and a score change as separate facts", async () => {
    const response = await POST(post(request(RUN_EARLIER.id, RUN_PROVIDER_OUTAGE.id)));
    const payload = await response.json();
    const quality = payload.report.qualityChanges.find((entry: { agent: string }) => entry.agent === "onchain");

    expect(quality.coverageDropped).toBe(true);
    expect(payload.report.causeNotEstablished).toBe(true);
  });

  it("reports an undetermined finding pairing rather than guessing", async () => {
    const response = await POST(post(request(RUN_SINGLE_FINDING.id, RUN_AMBIGUOUS_FINDINGS.id)));
    const payload = await response.json();

    expect(payload.report.coverage.ambiguousFindingCount).toBe(1);
  });

  it("refuses to compare a run against itself", async () => {
    const response = await POST(post(request(RUN_EARLIER.id, RUN_EARLIER.id)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "same_run" });
  });

  it("rejects a request with no wallet", async () => {
    const response = await POST(post({ leftRunId: "a", rightRunId: "b" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(
      post(request(RUN_EARLIER.id, "run-later"), { "content-length": String(COMPARISON_LIMITS.maxRequestBytes + 1) }),
    );

    expect(response.status).toBe(413);
  });
});
