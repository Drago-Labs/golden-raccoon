import { beforeEach, describe, expect, it, vi } from "vitest";
import { contractAddress, wallet } from "./fixtures";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), session: vi.fn(), authz: vi.fn(), rate: vi.fn() }));

vi.mock("@/server/research/nft-metadata", async () => {
  const actual = await vi.importActual<typeof import("@/server/research/nft-metadata")>("@/server/research/nft-metadata");
  return { ...actual, inspectNftMetadata: mocks.inspect };
});
vi.mock("@/server/security/walletSession", () => ({ resolveWalletSession: mocks.session }));
vi.mock("@/server/security/authz", () => ({ evaluateCapability: mocks.authz }));
vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: mocks.rate }));

import { POST } from "@/app/api/insights/nft-metadata/route";

function request(body: unknown) {
  return new Request("http://localhost/api/insights/nft-metadata", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = { walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", contractAddress };

const sampleResult = {
  network: "ethereum",
  contractAddress,
  state: "complete",
  standard: "erc721",
  standardDetection: { standard: "erc721", supportsErc165: true, erc721MetadataExtension: true, erc4906: false },
  contractUri: { uri: null, hosting: null, resolved: false, reason: "not implemented", metadata: null, media: null },
  samples: [],
  mutability: {
    owner: null,
    baseUriSetterSignals: [],
    freezeFlags: [],
    metadataUpdateScan: { fromBlock: "0", toBlock: "0", metadataUpdateCount: 0, batchMetadataUpdateCount: 0, truncated: false },
  },
  coverage: { standardDetected: true, sampledTokens: 0, resolvedSamples: 0, metadataUpdateScanTruncated: false },
  warnings: [],
};

describe("nft-metadata route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rate.mockReturnValue(null);
    mocks.session.mockReturnValue({ wallet });
    mocks.authz.mockReturnValue({ allowed: true });
    mocks.inspect.mockResolvedValue(sampleResult);
  });

  it("passes validated input through to the service", async () => {
    const response = await POST(request(validBody));
    expect(response.status).toBe(200);
    expect(mocks.inspect).toHaveBeenCalledWith(expect.objectContaining({ contractAddress }));
  });

  it("rejects an invalid body before touching the service", async () => {
    const response = await POST(request({ ...validBody, contractAddress: "not-an-address" }));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("rejects too many sampled token IDs before touching the service", async () => {
    const response = await POST(request({ ...validBody, tokenIds: ["1", "2", "3", "4", "5", "6"] }));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("rejects a network mismatch between network and walletNetwork", async () => {
    const response = await POST(request({ ...validBody, walletNetwork: "base" }));
    expect(response.status).toBe(400);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns 403 when the wallet session does not authorize the request", async () => {
    mocks.authz.mockReturnValue({ allowed: false, reason: "resource_owner_mismatch" });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns the session's own response when no wallet session exists", async () => {
    const forbidden = new Response(null, { status: 403 });
    mocks.session.mockReturnValue({ response: forbidden });
    const response = await POST(request(validBody));
    expect(response.status).toBe(403);
    expect(mocks.inspect).not.toHaveBeenCalled();
  });

  it("returns 503 when the service reports the provider as unavailable", async () => {
    mocks.inspect.mockResolvedValue({ ...sampleResult, state: "unavailable" });
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
  });

  it("sets a no-store cache header", async () => {
    const response = await POST(request(validBody));
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
