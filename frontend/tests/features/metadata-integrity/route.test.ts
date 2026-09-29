import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ABSENT_TOML,
  CONFLICTING_TOML,
  ISSUER_A,
  MATCHING_TOML,
  request,
} from "./fixtures";

const issuerState = vi.hoisted(() => ({
  homeDomain: "example.com" as string | null,
  found: true,
  sequence: "12345",
  lastModifiedLedger: 50_000_000,
  issues: [] as string[],
}));

const tomlState = vi.hoisted(() => ({
  body: null as string | null,
  outcome: "ok" as string,
  issues: [] as string[],
}));

vi.mock("@/server/research/metadata-integrity/issuerReader", () => ({
  createProductionIssuerReader: () => async () => ({
    homeDomain: issuerState.homeDomain,
    sequence: issuerState.sequence,
    lastModifiedLedger: issuerState.lastModifiedLedger,
    found: issuerState.found,
    issues: issuerState.issues,
  }),
  horizonAccountUrl: (network: string, issuer: string) =>
    `https://horizon${network === "testnet" ? "-testnet" : ""}.stellar.org/accounts/${issuer}`,
  horizonBaseUrl: (network: string) =>
    `https://horizon${network === "testnet" ? "-testnet" : ""}.stellar.org`,
}));

vi.mock("@/server/research/metadata-integrity/tomlFetch", () => ({
  createProductionTomlFetcher: () => async () => ({
    outcome: tomlState.outcome,
    requestedUrl: "https://example.com/.well-known/stellar.toml",
    finalUrl: "https://example.com/.well-known/stellar.toml",
    httpStatus: tomlState.outcome === "ok" ? 200 : 500,
    redirectCount: 0,
    contentType: "text/plain",
    byteLength: tomlState.body?.length ?? 0,
    body: tomlState.body,
    issues: tomlState.issues,
  }),
  probeTomlUrlSafety: (url: string) => ({
    allowed: url.startsWith("https://") && !url.includes("127.0.0.1"),
    issues: [],
  }),
}));

const { POST } = await import("@/app/api/insights/metadata-integrity/route");

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);

  return new NextRequest("http://localhost/api/insights/metadata-integrity", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: payload,
  });
}

beforeEach(() => {
  issuerState.homeDomain = "example.com";
  issuerState.found = true;
  issuerState.issues = [];
  tomlState.body = MATCHING_TOML;
  tomlState.outcome = "ok";
  tomlState.issues = [];
});

describe("POST /api/insights/metadata-integrity", () => {
  it("returns a report for a matching declaration", async () => {
    const response = await POST(post(request()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.declarationStatus).toBe("matched");
    expect(body.report.issuer).toBe(ISSUER_A);
    expect(body.report.domainOwnershipClaimed).toBe(false);
  });

  it("returns conflicting status without a legitimacy verdict", async () => {
    tomlState.body = CONFLICTING_TOML;
    const response = await POST(post(request()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.declarationStatus).toBe("conflicting");
    expect(body.report.legitimacyVerdict).toBeNull();
  });

  it("returns absent when the currency is missing", async () => {
    tomlState.body = ABSENT_TOML;
    const response = await POST(post(request()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.declarationStatus).toBe("absent");
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(post("{not-json"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_json");
  });

  it("rejects an invalid request body", async () => {
    const response = await POST(post({ assetCode: "USDC" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_request");
  });

  it("rejects oversized payloads by content-length", async () => {
    const response = await POST(
      post(request(), { "content-length": String(2_000_000) }),
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.error).toBe("payload_too_large");
  });

  it("surfaces unreachable TOML as a report, not a 500", async () => {
    tomlState.outcome = "timeout";
    tomlState.body = null;
    tomlState.issues = ["aborted"];

    const response = await POST(post(request()));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.declarationStatus).toBe("unreachable");
    expect(body.report.tomlFetch.outcome).toBe("timeout");
  });
});
