import { describe, expect, it } from "vitest";
import { issuerControlRequestSchema } from "@/server/research/issuer-control/schema";
import { wallet } from "./fixtures";

describe("issuer-control validation", () => {
  it("rejects network mismatch and pagination overflow", () => {
    expect(
      issuerControlRequestSchema.safeParse({
        walletAddress: wallet,
        assetQuery: "XLM",
        network: "stellar-testnet",
        walletNetwork: "stellar-pubnet",
      }).success,
    ).toBe(false);
    expect(
      issuerControlRequestSchema.safeParse({
        walletAddress: wallet,
        assetQuery: "XLM",
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
        maxPages: 6,
      }).success,
    ).toBe(false);
  });

  it("rejects malformed account identifiers", () => {
    expect(
      issuerControlRequestSchema.safeParse({
        walletAddress: "not-a-g-address",
        assetQuery: "XLM",
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
      }).success,
    ).toBe(false);
  });

  it("accepts bounded classic asset queries", () => {
    expect(
      issuerControlRequestSchema.safeParse({
        walletAddress: wallet,
        assetQuery: "USD:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
        pageSize: 20,
        maxPages: 3,
      }).success,
    ).toBe(true);
  });
});
