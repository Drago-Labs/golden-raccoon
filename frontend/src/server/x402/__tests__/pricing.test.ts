import { describe, expect, it } from "vitest";
import { PricingEngine } from "@/server/x402/metering/pricing";
import { MemoryX402Store } from "@/server/x402/store/memory";

describe("x402 pricing engine and time-bound quotes", () => {
  it("locks payment window pricing so in-flight quotes are honored after global price changes", async () => {
    let mockTime = 1_000_000;
    const store = new MemoryX402Store();
    const pricing = new PricingEngine(store, () => mockTime);

    const initialQuote = await pricing.issueQuote({
      resource: "/api/x402/deep-scan",
      priceUsd: "$0.99",
      chainFamily: "evm",
      network: "eip155:8453",
      asset: "USDC",
      payTo: "0x1111111111111111111111111111111111111111",
      ttlSeconds: 300,
    });

    expect(initialQuote.id).toMatch(/^quot_/);
    expect(initialQuote.priceUsd).toBe("$0.99");
    expect(pricing.isQuoteActive(initialQuote)).toBe(true);

    const newLivePrice = "$1.99";
    expect(newLivePrice).not.toBe(initialQuote.priceUsd);

    const validation = await pricing.validatePaymentAgainstQuote(initialQuote.id, {
      amount: "0.99",
      asset: "USDC",
      network: "eip155:8453",
      chainFamily: "evm",
      payTo: "0x1111111111111111111111111111111111111111",
    });

    expect(validation.valid).toBe(true);
    expect(validation.quote?.priceUsd).toBe("$0.99");
  });

  it("refuses payments presenting an expired quote", async () => {
    let mockTime = 1_000_000;
    const store = new MemoryX402Store();
    const pricing = new PricingEngine(store, () => mockTime);

    const quote = await pricing.issueQuote({
      resource: "/api/x402/deep-scan",
      priceUsd: "$0.99",
      chainFamily: "evm",
      network: "eip155:8453",
      asset: "USDC",
      payTo: "0x1111111111111111111111111111111111111111",
      ttlSeconds: 60,
    });

    mockTime += 61 * 1000;

    const validation = await pricing.validatePaymentAgainstQuote(quote.id, {
      amount: "0.99",
      asset: "USDC",
      network: "eip155:8453",
      chainFamily: "evm",
      payTo: "0x1111111111111111111111111111111111111111",
    });

    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain("expired");
  });

  it("refuses payments with amount or network mismatch against quote", async () => {
    const store = new MemoryX402Store();
    const pricing = new PricingEngine(store);

    const quote = await pricing.issueQuote({
      resource: "/api/x402/deep-scan",
      priceUsd: "$0.99",
      chainFamily: "stellar",
      network: "stellar:testnet",
      asset: "USDC",
      payTo: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA",
      ttlSeconds: 300,
    });

    const amountMismatch = await pricing.validatePaymentAgainstQuote(quote.id, {
      amount: "0.50",
      asset: "USDC",
      network: "stellar:testnet",
      chainFamily: "stellar",
      payTo: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA",
    });
    expect(amountMismatch.valid).toBe(false);

    const networkMismatch = await pricing.validatePaymentAgainstQuote(quote.id, {
      amount: "0.99",
      asset: "USDC",
      network: "stellar:pubnet",
      chainFamily: "stellar",
      payTo: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAA",
    });
    expect(networkMismatch.valid).toBe(false);
  });
});
