import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPublicHttpsText: vi.fn() }));
vi.mock("@/server/security/publicHttpsText", () => ({ readPublicHttpsText: mocks.readPublicHttpsText }));

import { loadTreeFile, resolveTreeUrl, TreeLoadError } from "@/server/research/merkle-claims/treeLoader";

describe("resolveTreeUrl", () => {
  it("passes an https:// URL through unchanged", () => {
    expect(resolveTreeUrl("https://example.com/tree.json")).toBe("https://example.com/tree.json");
  });

  it("translates an ipfs:// reference to a gateway URL", () => {
    expect(resolveTreeUrl("ipfs://bafycid/tree.json")).toBe("https://ipfs.io/ipfs/bafycid/tree.json");
  });

  it("translates a bare CID to a gateway URL", () => {
    expect(resolveTreeUrl("QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o")).toBe(
      "https://ipfs.io/ipfs/QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
    );
  });

  it("refuses a plain http:// source", () => {
    expect(() => resolveTreeUrl("http://example.com/tree.json")).toThrow(TreeLoadError);
  });

  it("refuses an unrecognized source", () => {
    expect(() => resolveTreeUrl("not a source")).toThrow(TreeLoadError);
  });
});

describe("loadTreeFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and validates a well-formed tree file", async () => {
    mocks.readPublicHttpsText.mockResolvedValueOnce(
      JSON.stringify({ merkleRoot: `0x${"1".repeat(64)}`, claims: { "0xabc": { index: 0, amount: "100", proof: [] } } }),
    );
    const tree = await loadTreeFile("https://example.com/tree.json");
    expect(tree.merkleRoot).toBe(`0x${"1".repeat(64)}`);
    expect(tree.claims["0xabc"].amount).toBe("100");
  });

  it("fails closed when the fetch itself fails", async () => {
    mocks.readPublicHttpsText.mockRejectedValueOnce(new Error("HTTP 404"));
    await expect(loadTreeFile("https://example.com/missing.json")).rejects.toThrow(TreeLoadError);
  });

  it("fails closed on invalid JSON", async () => {
    mocks.readPublicHttpsText.mockResolvedValueOnce("not json");
    await expect(loadTreeFile("https://example.com/tree.json")).rejects.toThrow(TreeLoadError);
  });

  it("fails closed when the shape does not match the expected tree format", async () => {
    mocks.readPublicHttpsText.mockResolvedValueOnce(JSON.stringify({ unexpected: true }));
    await expect(loadTreeFile("https://example.com/tree.json")).rejects.toThrow(TreeLoadError);
  });

  it("fails closed on a malformed proof entry (not a 32-byte hex word)", async () => {
    mocks.readPublicHttpsText.mockResolvedValueOnce(
      JSON.stringify({ merkleRoot: `0x${"1".repeat(64)}`, claims: { "0xabc": { index: 0, amount: "100", proof: ["not-a-hash"] } } }),
    );
    await expect(loadTreeFile("https://example.com/tree.json")).rejects.toThrow(TreeLoadError);
  });
});
