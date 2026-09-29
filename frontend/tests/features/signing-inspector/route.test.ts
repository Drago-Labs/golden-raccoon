import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/insights/signing-inspector/route";
import { SIGNING_LIMITS } from "@/server/research/signing-inspector/schema";
import {
  MALFORMED_XDR,
  MULTI_OPERATION_XDR,
  TRANSFER,
  UNKNOWN_SELECTOR_CALLDATA,
  UNLIMITED_APPROVE,
  UNLIMITED_PERMIT,
  WRONG_CHAIN_PERMIT,
  calldataRequest,
  envelopeRequest,
  typedDataRequest,
} from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/signing-inspector", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/insights/signing-inspector", () => {
  it("decodes an unlimited approval", async () => {
    const response = await POST(post(calldataRequest(UNLIMITED_APPROVE)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.permissions[0].isUnlimited).toBe(true);
  });

  it("decodes a Stellar envelope with several operations", async () => {
    const response = await POST(post(envelopeRequest(MULTI_OPERATION_XDR)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.operations).toHaveLength(4);
  });

  it("reports a domain-mismatched permit with a 200 and an explicit finding", async () => {
    const response = await POST(post(typedDataRequest(WRONG_CHAIN_PERMIT)));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.contextBinding.some((entry: { state: string }) => entry.state === "mismatch")).toBe(true);
  });

  it("always states that decoding is not approval", async () => {
    const response = await POST(post(typedDataRequest(UNLIMITED_PERMIT)));
    const payload = await response.json();

    expect(payload.report.decodingIsNotApproval).toBe(true);
    expect(payload.report.readOnly).toBe(true);
  });

  it("returns an unavailable coverage for an unrecognized selector", async () => {
    const response = await POST(post(calldataRequest(UNKNOWN_SELECTOR_CALLDATA)));
    const payload = await response.json();

    expect(payload.report.coverage.state).toBe("unavailable");
  });

  it("rejects malformed XDR with a readable code", async () => {
    const response = await POST(post(envelopeRequest(MALFORMED_XDR)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "malformed_envelope" });
  });

  it("rejects an oversized payload with 413", async () => {
    const response = await POST(post(envelopeRequest("A".repeat(SIGNING_LIMITS.maxPayloadChars + 10))));

    expect(response.status).toBe(413);
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(post(calldataRequest(TRANSFER), { "content-length": String(SIGNING_LIMITS.maxRequestBytes + 1) }));

    expect(response.status).toBe(413);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects a request with no payload", async () => {
    const response = await POST(post({ evaluatedAt: "2026-03-01T12:00:00.000Z" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("never echoes a payload back outside the report it was asked for", async () => {
    const response = await POST(post(calldataRequest(TRANSFER)));
    const body = await response.text();

    expect(body).not.toContain("privateKey");
    expect(body).not.toContain("signature");
  });
});
