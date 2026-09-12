import { describe, expect, it } from "vitest";
import {
  canonicalAssetIdSchema,
  pegAnalysisQuerySchema,
  pegAnalysisRequestSchema,
  pegDefinitionSchema,
  rawObservationSchema,
  referenceRateSchema,
} from "@/server/research/peg-observations";
import { USDC_ETH_ID } from "./fixtures";

describe("Peg Observation Schema Validations", () => {
  it("validates canonical asset identities across EVM and Stellar", () => {
    const validEvm = canonicalAssetIdSchema.safeParse(USDC_ETH_ID);
    expect(validEvm.success).toBe(true);

    const validStellar = canonicalAssetIdSchema.safeParse({
      chainFamily: "stellar",
      network: "stellar-pubnet",
      symbol: "USDC",
      addressOrIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    });
    expect(validStellar.success).toBe(true);

    const invalidChain = canonicalAssetIdSchema.safeParse({
      chainFamily: "unsupported-chain",
      network: "mainnet",
      symbol: "USDC",
      addressOrIssuer: "0x123",
    });
    expect(invalidChain.success).toBe(false);
  });

  it("rejects non-positive peg declared target values", () => {
    const valid = pegDefinitionSchema.safeParse({
      assetId: USDC_ETH_ID,
      name: "USD Coin",
      referenceCurrency: "USD",
      declaredTargetValue: 1.0,
      source: "canonical",
      provenance: "Circle official issuance",
    });
    expect(valid.success).toBe(true);

    const zeroTarget = pegDefinitionSchema.safeParse({
      assetId: USDC_ETH_ID,
      name: "USD Coin",
      referenceCurrency: "USD",
      declaredTargetValue: 0,
      source: "canonical",
      provenance: "Test",
    });
    expect(zeroTarget.success).toBe(false);

    const negativeTarget = pegDefinitionSchema.safeParse({
      assetId: USDC_ETH_ID,
      name: "USD Coin",
      referenceCurrency: "USD",
      declaredTargetValue: -1.0,
      source: "canonical",
      provenance: "Test",
    });
    expect(negativeTarget.success).toBe(false);
  });

  it("enforces observation price positivity and timestamp non-negativity", () => {
    const validObs = rawObservationSchema.safeParse({
      timestamp: 1_700_000_000_000,
      price: 0.9995,
      currency: "USD",
    });
    expect(validObs.success).toBe(true);

    const negativePrice = rawObservationSchema.safeParse({
      timestamp: 1_700_000_000_000,
      price: -0.5,
      currency: "USD",
    });
    expect(negativePrice.success).toBe(false);

    const zeroPrice = rawObservationSchema.safeParse({
      timestamp: 1_700_000_000_000,
      price: 0,
      currency: "USD",
    });
    expect(zeroPrice.success).toBe(false);

    const negativeTime = rawObservationSchema.safeParse({
      timestamp: -1,
      price: 1.0,
      currency: "USD",
    });
    expect(negativeTime.success).toBe(false);
  });

  it("validates reference rates and rejects negative conversion rates", () => {
    const validRate = referenceRateSchema.safeParse({
      fromCurrency: "EUR",
      toCurrency: "USD",
      rate: 1.085,
      timestamp: 1_700_000_000_000,
      source: "ecb",
    });
    expect(validRate.success).toBe(true);

    const negativeRate = referenceRateSchema.safeParse({
      fromCurrency: "EUR",
      toCurrency: "USD",
      rate: -1.085,
      timestamp: 1_700_000_000_000,
      source: "ecb",
    });
    expect(negativeRate.success).toBe(false);
  });

  it("validates analysis requests and rejects negative threshold basis points", () => {
    const validRequest = pegAnalysisRequestSchema.safeParse({
      assetId: USDC_ETH_ID,
      thresholdBps: 25,
      gapToleranceMs: 1_800_000,
    });
    expect(validRequest.success).toBe(true);

    const negativeThreshold = pegAnalysisRequestSchema.safeParse({
      assetId: USDC_ETH_ID,
      thresholdBps: -10,
    });
    expect(negativeThreshold.success).toBe(false);
  });

  it("parses query parameters with type coercions", () => {
    const parsedQuery = pegAnalysisQuerySchema.safeParse({
      chainFamily: "evm",
      network: "ethereum",
      symbol: "USDC",
      addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      thresholdBps: "75",
      gapToleranceMs: "7200000",
      fixture: "usd-and-nonusd-targets",
    });

    expect(parsedQuery.success).toBe(true);
    if (parsedQuery.success) {
      expect(parsedQuery.data.thresholdBps).toBe(75);
      expect(parsedQuery.data.gapToleranceMs).toBe(7_200_000);
      expect(parsedQuery.data.fixture).toBe("usd-and-nonusd-targets");
    }
  });
});
