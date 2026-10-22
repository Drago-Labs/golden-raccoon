import { describe, expect, it } from "vitest";
import { classifyHosting } from "@/server/research/nft-metadata/hostingClassifier";

describe("classifyHosting", () => {
  it("classifies ipfs:// URIs as pinned IPFS and translates them to a gateway URL", () => {
    const result = classifyHosting("ipfs://bafybeicid/1.json");
    expect(result.kind).toBe("ipfs");
    expect(result.pinned).toBe(true);
    expect(result.fetchableUrl).toBe("https://ipfs.io/ipfs/bafybeicid/1.json");
  });

  it("strips a redundant ipfs/ prefix after the scheme", () => {
    const result = classifyHosting("ipfs://ipfs/bafybeicid/1.json");
    expect(result.fetchableUrl).toBe("https://ipfs.io/ipfs/bafybeicid/1.json");
  });

  it("classifies ar:// URIs as pinned Arweave", () => {
    const result = classifyHosting("ar://abc123");
    expect(result.kind).toBe("arweave");
    expect(result.pinned).toBe(true);
    expect(result.fetchableUrl).toBe("https://arweave.net/abc123");
  });

  it("classifies data: URIs as on-chain and not externally fetchable", () => {
    const result = classifyHosting("data:application/json;base64,eyJhIjoxfQ==");
    expect(result.kind).toBe("onchain");
    expect(result.pinned).toBe(true);
    expect(result.fetchableUrl).toBeNull();
  });

  it("classifies an HTTPS gateway path that embeds a CIDv0 as pinned IPFS", () => {
    const result = classifyHosting("https://gateway.example.com/ipfs/QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o/1.json");
    expect(result.kind).toBe("ipfs");
    expect(result.pinned).toBe(true);
  });

  it("classifies an HTTPS gateway path that embeds a CIDv1 as pinned IPFS", () => {
    const result = classifyHosting("https://gateway.example.com/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/1.json");
    expect(result.kind).toBe("ipfs");
    expect(result.pinned).toBe(true);
  });

  it("classifies a plain HTTPS path with no content address as mutable HTTP", () => {
    const result = classifyHosting("https://api.example.com/metadata/1.json");
    expect(result.kind).toBe("http");
    expect(result.pinned).toBe(false);
    expect(result.fetchableUrl).toBe("https://api.example.com/metadata/1.json");
  });

  it("classifies plain (non-HTTPS) HTTP as mutable and refuses to fetch it", () => {
    const result = classifyHosting("http://api.example.com/metadata/1.json");
    expect(result.kind).toBe("http");
    expect(result.pinned).toBe(false);
    expect(result.fetchableUrl).toBeNull();
  });

  it("classifies a malformed or unrecognized URI as an opaque mutable reference, not a crash", () => {
    const result = classifyHosting("not a uri at all");
    expect(result.kind).toBe("http");
    expect(result.pinned).toBe(false);
    expect(result.fetchableUrl).toBeNull();
  });
});
