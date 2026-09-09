import { describe, expect, it } from "vitest";
import {
  computeQuoteHash,
  createQuoteBinding,
  verifyQuoteBinding,
  attachBindingToStellarQuote,
} from "../../providers/quote/binding";
import type { StellarSwapQuote } from "../../types";

describe("quote cryptographic binding", () => {
  const baseParams = {
    chain: "stellar",
    walletAddress: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    fromAsset: "native",
    toAsset: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    inputAmount: "100.00",
    minReceiveAmount: "95.50",
    ttlMs: 30_000,
  };

  it("computes deterministic quote hashes", () => {
    const hash1 = computeQuoteHash(baseParams);
    const hash2 = computeQuoteHash(baseParams);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("creates valid HMAC signature and passes verification", () => {
    const binding = createQuoteBinding(baseParams);
    const check = verifyQuoteBinding({
      binding,
      chain: baseParams.chain,
      walletAddress: baseParams.walletAddress,
      fromAsset: baseParams.fromAsset,
      toAsset: baseParams.toAsset,
      inputAmount: baseParams.inputAmount,
    });

    expect(check.valid).toBe(true);
    expect(check.error).toBeNull();
  });

  it("rejects expired quote bindings with quote_expired", () => {
    // Create binding with negative TTL (already expired)
    const binding = createQuoteBinding({
      ...baseParams,
      ttlMs: -1000,
    });

    const check = verifyQuoteBinding({
      binding,
      chain: baseParams.chain,
      walletAddress: baseParams.walletAddress,
      fromAsset: baseParams.fromAsset,
      toAsset: baseParams.toAsset,
      inputAmount: baseParams.inputAmount,
    });

    expect(check.valid).toBe(false);
    expect(check.error).toBe("quote_expired");
  });

  it("detects tampering with input amount", () => {
    const binding = createQuoteBinding(baseParams);
    const check = verifyQuoteBinding({
      binding,
      chain: baseParams.chain,
      walletAddress: baseParams.walletAddress,
      fromAsset: baseParams.fromAsset,
      toAsset: baseParams.toAsset,
      inputAmount: "999.00", // Tampered amount!
    });

    expect(check.valid).toBe(false);
    expect(check.error).toBe("quote_binding_mismatch");
  });

  it("detects tampering with destination asset", () => {
    const binding = createQuoteBinding(baseParams);
    const check = verifyQuoteBinding({
      binding,
      chain: baseParams.chain,
      walletAddress: baseParams.walletAddress,
      fromAsset: baseParams.fromAsset,
      toAsset: "SCAM:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
      inputAmount: baseParams.inputAmount,
    });

    expect(check.valid).toBe(false);
    expect(check.error).toBe("quote_binding_mismatch");
  });

  it("detects tampering with wallet address", () => {
    const binding = createQuoteBinding(baseParams);
    const check = verifyQuoteBinding({
      binding,
      chain: baseParams.chain,
      walletAddress: "GATTACKER47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLL",
      fromAsset: baseParams.fromAsset,
      toAsset: baseParams.toAsset,
      inputAmount: baseParams.inputAmount,
    });

    expect(check.valid).toBe(false);
    expect(check.error).toBe("quote_binding_mismatch");
  });

  it("attaches binding to Stellar quote", () => {
    const mockQuote: StellarSwapQuote = {
      type: "classic",
      sendAsset: "XLM",
      sendAmount: "100.00",
      destAsset: "USDC",
      destAmount: "95.50",
      exchangeRate: "0.955",
      path: [],
      priceImpact: "0.1",
      pathPaymentOps: [],
      sorobanSimulation: null,
      chain: "stellar",
      walletAddress: baseParams.walletAddress,
    };

    const bound = attachBindingToStellarQuote(mockQuote);
    expect(bound.quoteHash).toBeDefined();
    expect(bound.quoteSignature).toBeDefined();
    expect(bound.binding).toBeDefined();
    expect(bound.binding?.quoteHash).toBe(bound.quoteHash);
  });
});
