import { describe, expect, it } from "vitest";
import { pathPaymentRequestSchema } from "@/server/research/path-payment/schema";
import { isExactAmount } from "@/server/research/path-payment/assets";
import { issuerA, wallet } from "./fixtures";

describe("path-payment validation", () => {
  it("rejects network mismatch and imprecise amounts", () => {
    expect(
      pathPaymentRequestSchema.safeParse({
        walletAddress: wallet,
        network: "stellar-testnet",
        walletNetwork: "stellar-pubnet",
        mode: "strict_send",
        sourceAsset: "XLM",
        destinationAsset: `USD:${issuerA}`,
        amount: "1",
      }).success,
    ).toBe(false);
    expect(isExactAmount("1.12345678")).toBe(false);
    expect(isExactAmount("1.1234567")).toBe(true);
  });

  it("accepts bounded classic asset requests", () => {
    expect(
      pathPaymentRequestSchema.safeParse({
        walletAddress: wallet,
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
        mode: "strict_receive",
        sourceAsset: "XLM",
        destinationAsset: `USD:${issuerA}`,
        amount: "1.0000000",
      }).success,
    ).toBe(true);
  });
});
