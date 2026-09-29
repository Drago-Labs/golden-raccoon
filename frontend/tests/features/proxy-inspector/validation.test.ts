import { describe, expect, it } from "vitest";
import { proxyRequestSchema } from "@/server/research/proxy-inspector";
import { proxy } from "./fixtures";
describe("proxy request validation", () => {
  const valid = { walletAddress: proxy, network: "ethereum", walletNetwork: "ethereum", contractAddress: proxy };
  it("accepts configured network-scoped input", () => expect(proxyRequestSchema.safeParse(valid).success).toBe(true));
  it("rejects arbitrary networks, invalid addresses, and mismatch", () => {
    expect(proxyRequestSchema.safeParse({ ...valid, network: "http://evil" }).success).toBe(false);
    expect(proxyRequestSchema.safeParse({ ...valid, contractAddress: "bad" }).success).toBe(false);
    expect(proxyRequestSchema.safeParse({ ...valid, walletNetwork: "base" }).success).toBe(false);
  });
});
