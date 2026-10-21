import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { request } from "./fixtures";

const state = vi.hoisted(() => ({ burnState: "completed" as string }));

vi.mock("@/server/research/cctp-transfers/sourceDecoder", () => ({
  decodeSourceBurn: async () =>
    state.burnState === "completed"
      ? {
          state: "completed",
          blockNumber: 1,
          nonce: `0x${"a".repeat(64)}`,
          burnTokenAddress: null,
          depositorAddress: null,
          mintRecipientRaw: null,
          mintRecipientDisplay: null,
          destinationDomain: 27,
          destinationChain: "Stellar",
          maxFeeBaseUnits: "0",
          minFinalityThreshold: 1000,
          amountBaseUnits: "1000",
          rawMessageHex: null,
          issues: [],
        }
      : { state: "unknown", blockNumber: null, nonce: null, burnTokenAddress: null, depositorAddress: null, mintRecipientRaw: null, mintRecipientDisplay: null, destinationDomain: null, destinationChain: "not yet known", maxFeeBaseUnits: null, minFinalityThreshold: null, amountBaseUnits: null, rawMessageHex: null, issues: ["stub"] },
}));

vi.mock("@/server/research/cctp-transfers/attestationClient", () => ({
  fetchAttestation: async () => ({ state: "pending", status: "pending_confirmations", feeExecutedBaseUnits: null, cctpVersion: 2, destinationMintTxHashReported: null, attestedMessageHex: null, issues: [] }),
}));

vi.mock("@/server/research/cctp-transfers/evmDestination", () => ({
  checkEvmNonceUsed: async () => ({ state: "unknown", destinationChain: "?", nonceUsed: null, issues: [] }),
}));

vi.mock("@/server/research/cctp-transfers/stellarDestination", () => ({
  checkStellarNonceUsed: async () => ({ state: "pending", destinationChain: "Stellar", nonceUsed: false, issues: [] }),
}));

const { POST } = await import("@/app/api/insights/cctp-transfers/route");

function post(body: unknown): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost/api/insights/cctp-transfers", { method: "POST", headers: { "content-type": "application/json" }, body: payload });
}

describe("POST /api/insights/cctp-transfers", () => {
  it("returns a report for a known source chain", async () => {
    state.burnState = "completed";
    const response = await POST(post(request()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.sourceChain).toBe("Ethereum");
    expect(body.report.transferVerdict).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 for an unrecognized source chain", async () => {
    const response = await POST(post(request({ sourceChain: "Not A Chain" })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("unknown_source_chain");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(post("not json"));
    expect(response.status).toBe(400);
  });

  it("returns 413 for an oversized payload", async () => {
    const response = await POST(post(request({ padding: "x".repeat(50_000) })));
    expect(response.status).toBe(413);
  });

  it("returns a 200 with unavailable coverage when the burn cannot be read", async () => {
    state.burnState = "unknown";
    const response = await POST(post(request()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.coverage.state).toBe("unavailable");
  });
});
