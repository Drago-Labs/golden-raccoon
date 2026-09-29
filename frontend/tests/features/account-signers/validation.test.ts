import { describe, expect, it } from "vitest";
import { accountSignersRequestSchema } from "@/server/research/account-signers/schema";
import { wallet } from "./fixtures";

describe("account-signers validation", () => {
  it("rejects network mismatch and malformed G-addresses", () => {
    expect(
      accountSignersRequestSchema.safeParse({
        walletAddress: wallet,
        network: "stellar-testnet",
        walletNetwork: "stellar-pubnet",
      }).success,
    ).toBe(false);
    expect(
      accountSignersRequestSchema.safeParse({
        walletAddress: "bad",
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
      }).success,
    ).toBe(false);
  });

  it("accepts matching networks", () => {
    expect(
      accountSignersRequestSchema.safeParse({
        walletAddress: wallet,
        accountAddress: wallet,
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
      }).success,
    ).toBe(true);
  });
});
