/**
 * Fixtures for the peg deviation workspace.
 *
 * Deviations are chosen so each expected basis-point value is exact:
 * a price of 0.9950 against a 1.0000 target is -50 bps; 0.8217 against a
 * 0.8300 EUR target is -100 bps. Nothing here touches a network or a paid
 * provider, and the clock is supplied through the window rather than read.
 */
import type { PegRequest } from "@/server/research/peg-observations/schema";

const WINDOW_START = "2026-01-01T00:00:00.000Z";
const WINDOW_END = "2026-01-02T00:00:00.000Z";

const ISSUER_CIRCLE = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const ISSUER_OTHER = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function at(hour: number): string {
  return `2026-01-01T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

/**
 * A USD-pegged asset and a EUR-pegged asset whose target is 0.83, not 1.
 * The EUR asset would look catastrophically depegged against a dollar target,
 * which is exactly the mistake this feature refuses to make.
 */
export const usdAndNonUsdTargets: PegRequest = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  thresholdBps: 50,
  maxGapSeconds: 7_200,
  staleAfterSeconds: 86_400,
  rateToleranceSeconds: 3_600,
  definitions: [
    {
      asset: { chainId: "stellar-pubnet", symbol: "USDC", issuer: ISSUER_CIRCLE },
      referenceCurrency: "USD",
      targetValue: "1.00",
      provenance: "issuer_disclosure",
      declaredAt: "2025-12-01T00:00:00.000Z",
    },
    {
      asset: { chainId: "stellar-pubnet", symbol: "EURC", issuer: ISSUER_CIRCLE },
      referenceCurrency: "EUR",
      targetValue: "0.83",
      provenance: "issuer_disclosure",
      declaredAt: "2025-12-01T00:00:00.000Z",
    },
  ],
  series: [
    {
      asset: { chainId: "stellar-pubnet", symbol: "USDC", issuer: ISSUER_CIRCLE },
      observations: [
        { observedAt: at(0), price: "1.00", currency: "USD", sourceLabel: "SDEX mid" },
        { observedAt: at(1), price: "0.9950", currency: "USD", sourceLabel: "SDEX mid" },
        { observedAt: at(2), price: "1.00", currency: "USD", sourceLabel: "SDEX mid" },
      ],
    },
    {
      asset: { chainId: "stellar-pubnet", symbol: "EURC", issuer: ISSUER_CIRCLE },
      observations: [
        { observedAt: at(0), price: "0.83", currency: "EUR", sourceLabel: "SDEX mid" },
        // 0.8217 / 0.83 - 1 = -0.01 exactly, i.e. -100 bps.
        { observedAt: at(1), price: "0.8217", currency: "EUR", sourceLabel: "SDEX mid" },
        { observedAt: at(2), price: "0.83", currency: "EUR", sourceLabel: "SDEX mid" },
      ],
    },
  ],
  referenceRates: [],
};

/**
 * A deviation that opens, persists across a gap, and recovers. The duration
 * must be reported as a lower bound because of the gap.
 */
export const deviationRecoveryWithGaps: PegRequest = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  thresholdBps: 50,
  maxGapSeconds: 3_600,
  staleAfterSeconds: 86_400,
  rateToleranceSeconds: 3_600,
  definitions: [
    {
      asset: { chainId: "ethereum", symbol: "USDT", contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
      referenceCurrency: "USD",
      targetValue: "1.00",
      provenance: "operator_declared",
    },
  ],
  series: [
    {
      asset: { chainId: "ethereum", symbol: "USDT", contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
      observations: [
        { observedAt: at(0), price: "1.00", currency: "USD", sourceLabel: "Pool mid" },
        // -100 bps opens an episode at 01:00.
        { observedAt: at(1), price: "0.99", currency: "USD", sourceLabel: "Pool mid" },
        // 5-hour gap: nothing is known between 02:00 and 07:00.
        { observedAt: at(2), price: "0.985", currency: "USD", sourceLabel: "Pool mid" },
        { observedAt: at(7), price: "0.99", currency: "USD", sourceLabel: "Pool mid" },
        // Recovery observed at 08:00.
        { observedAt: at(8), price: "1.00", currency: "USD", sourceLabel: "Pool mid" },
      ],
    },
  ],
  referenceRates: [],
};

/**
 * Two assets sharing the symbol USDC with different issuers, where only one has
 * a declared peg, plus an observation in a currency with no available rate.
 */
export const missingRatesIdentityCollision: PegRequest = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  thresholdBps: 50,
  maxGapSeconds: 7_200,
  staleAfterSeconds: 86_400,
  rateToleranceSeconds: 3_600,
  definitions: [
    {
      asset: { chainId: "stellar-pubnet", symbol: "USDC", issuer: ISSUER_CIRCLE },
      referenceCurrency: "USD",
      targetValue: "1.00",
      provenance: "issuer_disclosure",
    },
  ],
  series: [
    {
      asset: { chainId: "stellar-pubnet", symbol: "USDC", issuer: ISSUER_CIRCLE },
      observations: [
        { observedAt: at(0), price: "1.00", currency: "USD", sourceLabel: "SDEX mid" },
        // Quoted in XLM with no XLM->USD rate supplied: must stay unconverted.
        { observedAt: at(1), price: "2.50", currency: "XLM", sourceLabel: "SDEX mid" },
      ],
    },
    {
      // Same symbol, different issuer, no declaration: must not borrow the one above.
      asset: { chainId: "stellar-pubnet", symbol: "USDC", issuer: ISSUER_OTHER },
      observations: [{ observedAt: at(0), price: "0.40", currency: "USD", sourceLabel: "SDEX mid" }],
    },
  ],
  referenceRates: [],
};

/** Observations quoted in EUR with a timestamped EUR→USD rate available. */
export const convertibleSeries: PegRequest = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  thresholdBps: 50,
  maxGapSeconds: 7_200,
  staleAfterSeconds: 86_400,
  rateToleranceSeconds: 3_600,
  definitions: [
    {
      asset: { chainId: "ethereum", symbol: "EURS", contractAddress: "0xdb25f211ab05b1c97d595516f45794528a807ad8" },
      referenceCurrency: "USD",
      targetValue: "1.10",
      provenance: "prospectus",
    },
  ],
  series: [
    {
      asset: { chainId: "ethereum", symbol: "EURS", contractAddress: "0xdb25f211ab05b1c97d595516f45794528a807ad8" },
      observations: [
        // 1.00 EUR * 1.10 USD/EUR = 1.10 USD, exactly on target.
        { observedAt: at(1), price: "1.00", currency: "EUR", sourceLabel: "Pool mid" },
        // 0.99 EUR * 1.10 = 1.089 USD, which is -100 bps from 1.10.
        { observedAt: at(2), price: "0.99", currency: "EUR", sourceLabel: "Pool mid" },
      ],
    },
  ],
  referenceRates: [
    // One rate per observation hour: a rate more than the tolerance away from
    // an observation is refused, which the tolerance test below relies on.
    { from: "EUR", to: "USD", rate: "1.10", observedAt: at(1), sourceLabel: "ECB reference" },
    { from: "EUR", to: "USD", rate: "1.10", observedAt: at(2), sourceLabel: "ECB reference" },
  ],
};

/** Duplicate and out-of-order timestamps, to pin the documented rules. */
export const duplicatesAndDisorder: PegRequest = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  thresholdBps: 50,
  maxGapSeconds: 7_200,
  staleAfterSeconds: 86_400,
  rateToleranceSeconds: 3_600,
  definitions: [
    {
      asset: { chainId: "ethereum", symbol: "DAI", contractAddress: "0x6b175474e89094c44da98b954eedeac495271d0f" },
      referenceCurrency: "USD",
      targetValue: "1.00",
      provenance: "protocol_documentation",
    },
  ],
  series: [
    {
      asset: { chainId: "ethereum", symbol: "DAI", contractAddress: "0x6b175474e89094c44da98b954eedeac495271d0f" },
      observations: [
        { observedAt: at(2), price: "1.00", currency: "USD", sourceLabel: "Pool mid" },
        { observedAt: at(0), price: "1.00", currency: "USD", sourceLabel: "Pool mid" },
        { observedAt: at(1), price: "0.99", currency: "USD", sourceLabel: "First value" },
        { observedAt: at(1), price: "0.995", currency: "USD", sourceLabel: "Last value wins" },
      ],
    },
  ],
  referenceRates: [],
};

/** Exactly at the threshold: documented as opening an episode. */
export const exactlyAtThreshold: PegRequest = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  thresholdBps: 50,
  maxGapSeconds: 7_200,
  staleAfterSeconds: 86_400,
  rateToleranceSeconds: 3_600,
  definitions: [
    {
      asset: { chainId: "ethereum", symbol: "DAI", contractAddress: "0x6b175474e89094c44da98b954eedeac495271d0f" },
      referenceCurrency: "USD",
      targetValue: "1.00",
      provenance: "protocol_documentation",
    },
  ],
  series: [
    {
      asset: { chainId: "ethereum", symbol: "DAI", contractAddress: "0x6b175474e89094c44da98b954eedeac495271d0f" },
      observations: [
        // 0.995 / 1.00 - 1 = -0.005 = exactly -50 bps.
        { observedAt: at(0), price: "0.995", currency: "USD", sourceLabel: "Pool mid" },
        { observedAt: at(1), price: "1.00", currency: "USD", sourceLabel: "Pool mid" },
      ],
    },
  ],
  referenceRates: [],
};

/** Valid request carrying no series at all. */
export const emptyRequest: PegRequest = {
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  thresholdBps: 50,
  maxGapSeconds: 7_200,
  staleAfterSeconds: 86_400,
  rateToleranceSeconds: 3_600,
  definitions: [],
  series: [],
  referenceRates: [],
};
