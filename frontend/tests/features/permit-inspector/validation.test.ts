import { describe, expect, it } from "vitest";
import { permitRequestSchema } from "@/server/research/permit-inspector";
import { owner, spender, token, wallet } from "./fixtures";

describe("permit request validation", () => {
  const valid = { walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum", tokenAddress: token, ownerAddress: owner };

  it("accepts a configured, network-matched request with an optional spender", () => {
    expect(permitRequestSchema.safeParse(valid).success).toBe(true);
    expect(permitRequestSchema.safeParse({ ...valid, spenderAddress: spender }).success).toBe(true);
  });

  it("rejects an unsupported network, invalid addresses, and a wallet/target network mismatch", () => {
    expect(permitRequestSchema.safeParse({ ...valid, network: "http://evil" }).success).toBe(false);
    expect(permitRequestSchema.safeParse({ ...valid, tokenAddress: "bad" }).success).toBe(false);
    expect(permitRequestSchema.safeParse({ ...valid, ownerAddress: "bad" }).success).toBe(false);
    expect(permitRequestSchema.safeParse({ ...valid, spenderAddress: "bad" }).success).toBe(false);
    expect(permitRequestSchema.safeParse({ ...valid, walletNetwork: "base" }).success).toBe(false);
  });
});
