import { describe, expect, it } from "vitest";
import { inspectProxy } from "@/server/research/proxy-inspector";
import { directReader, implementation, proxy } from "./fixtures";
describe("proxy inspector", () => {
  it("resolves a direct ERC-1967 implementation at one block", async () => {
    const result = await inspectProxy({ network: "ethereum", contractAddress: proxy }, { reader: directReader() });
    expect(result).toMatchObject({ state: "complete", classification: "erc1967_direct", blockNumber: 100 });
    expect(result.nodes.some((node) => node.address === implementation)).toBe(true);
    expect(result.authority.conclusion).toContain("remains unknown");
  });
  it("keeps RPC failure distinguishable", async () => {
    const result = await inspectProxy({ network: "ethereum", contractAddress: proxy }, { reader: directReader(true) });
    expect(result).toMatchObject({ state: "unavailable", blockNumber: null });
  });
});
