import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPublicHttpsText: vi.fn() }));
vi.mock("@/server/security/publicHttpsText", () => ({ readPublicHttpsText: mocks.readPublicHttpsText }));

import { resolveMetadata } from "@/server/research/nft-metadata/resolutionProbe";

describe("resolveMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unresolved with a reason when no URI was returned on-chain", async () => {
    const result = await resolveMetadata(null);
    expect(result.resolved).toBe(false);
    expect(result.reason).toMatch(/no uri/i);
  });

  it("decodes an inline base64 data: URI without fetching the metadata document itself", async () => {
    const json = JSON.stringify({ name: "Inline", image: "ipfs://cid/img.png" });
    const uri = `data:application/json;base64,${Buffer.from(json).toString("base64")}`;
    mocks.readPublicHttpsText.mockResolvedValueOnce("ignored");

    const result = await resolveMetadata(uri);
    expect(result.resolved).toBe(true);
    expect(result.metadata?.name).toBe("Inline");
    expect(result.hosting?.kind).toBe("onchain");
    expect(mocks.readPublicHttpsText).toHaveBeenCalledTimes(1);
  });

  it("fetches and sanitizes HTTPS-hosted metadata, then probes its image field", async () => {
    mocks.readPublicHttpsText
      .mockResolvedValueOnce(JSON.stringify({ name: "Token", image: "https://cdn.example.com/1.png", attributes: [{}, {}] }))
      .mockResolvedValueOnce("imagebytes");

    const result = await resolveMetadata("https://api.example.com/1.json");
    expect(result.resolved).toBe(true);
    expect(result.metadata).toEqual({
      name: "Token",
      description: null,
      image: "https://cdn.example.com/1.png",
      animationUrl: null,
      attributesCount: 2,
    });
    expect(result.media?.resolved).toBe(true);
  });

  it("reports an unresolved sample when the fetch fails, without throwing", async () => {
    mocks.readPublicHttpsText.mockRejectedValueOnce(new Error("HTTP 404"));
    const result = await resolveMetadata("https://api.example.com/missing.json");
    expect(result.resolved).toBe(false);
    expect(result.reason).toBe("HTTP 404");
  });

  it("treats a byte-limit truncation on the media probe as a resolved (truncated) result, not a failure", async () => {
    mocks.readPublicHttpsText
      .mockResolvedValueOnce(JSON.stringify({ name: "Big", image: "https://cdn.example.com/big.png" }))
      .mockRejectedValueOnce(new Error("Response exceeds byte limit"));

    const result = await resolveMetadata("https://api.example.com/big.json");
    expect(result.resolved).toBe(true);
    expect(result.media?.resolved).toBe(true);
    expect(result.media?.reason).toMatch(/truncated/);
  });

  it("does not attempt to fetch a plain (non-HTTPS) HTTP URI", async () => {
    const result = await resolveMetadata("http://api.example.com/1.json");
    expect(result.resolved).toBe(false);
    expect(mocks.readPublicHttpsText).not.toHaveBeenCalled();
  });

  it("reports a parse failure for non-JSON metadata bodies without throwing", async () => {
    mocks.readPublicHttpsText.mockResolvedValueOnce("<html>not json</html>");
    const result = await resolveMetadata("https://api.example.com/1.json");
    expect(result.resolved).toBe(false);
    expect(result.metadata).toBeNull();
  });
});
