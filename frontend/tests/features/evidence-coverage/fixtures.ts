/**
 * Fixtures for the evidence coverage explorer.
 *
 * Each fixture isolates one claim the feature makes about evidence: that
 * repeating a source family is not corroboration, that a difference across
 * units or windows is not a contradiction, and that an undated observation is
 * unknown rather than fresh. Nothing here touches a network or a provider.
 */
import type { EvidenceRequest } from "@/server/research/evidence-coverage/schema";

const GENERATED_AT = "2026-01-05T12:00:00.000Z";
const FRESH = "2026-01-05T11:59:00.000Z";
const STALE = "2026-01-05T10:00:00.000Z";

const SUBJECT = {
  chainId: "stellar-pubnet",
  symbol: "USDC",
  issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
};

const OTHER_SUBJECT = {
  chainId: "ethereum",
  symbol: "USDC",
  contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

/**
 * One claim backed by three observations that all come from a single declared
 * family, and another backed by two genuinely independent families.
 */
export const duplicateSourceFamilies: EvidenceRequest = {
  reportId: "report-families-001",
  generatedAt: GENERATED_AT,
  staleAfterSeconds: 900,
  families: [
    {
      familyId: "vendor-alpha",
      label: "Alpha Data",
      memberLabels: ["Alpha Primary", "Alpha Mirror", "Alpha Cache"],
      rationale: "All three endpoints are operated by Alpha Data and resell the same upstream feed.",
    },
    {
      familyId: "vendor-beta",
      label: "Beta Feeds",
      memberLabels: ["Beta Direct"],
      rationale: "Independent operator with its own collection pipeline.",
    },
  ],
  claims: [
    {
      claimId: "claim-supply",
      label: "Circulating supply",
      subject: SUBJECT,
      observations: [
        {
          observationId: "supply-alpha-1",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "1000000", unit: "USDC" },
        },
        {
          observationId: "supply-alpha-2",
          sourceLabel: "Alpha Mirror",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "1000000", unit: "USDC" },
        },
        {
          observationId: "supply-alpha-3",
          sourceLabel: "Alpha Cache",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "1000000", unit: "USDC" },
        },
      ],
    },
    {
      claimId: "claim-holders",
      label: "Holder count",
      subject: SUBJECT,
      observations: [
        {
          observationId: "holders-alpha",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "4200", unit: "accounts" },
        },
        {
          observationId: "holders-beta",
          sourceLabel: "Beta Direct",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "4200", unit: "accounts" },
        },
      ],
    },
  ],
};

/**
 * One genuine contradiction, plus three differences that must *not* be reported
 * as contradictions: different units, disjoint windows, and free text.
 */
export const comparableAndIncomparableConflicts: EvidenceRequest = {
  reportId: "report-conflicts-002",
  generatedAt: GENERATED_AT,
  staleAfterSeconds: 900,
  families: [
    { familyId: "vendor-alpha", label: "Alpha Data", memberLabels: ["Alpha Primary"], rationale: "Operator A." },
    { familyId: "vendor-beta", label: "Beta Feeds", memberLabels: ["Beta Direct"], rationale: "Operator B." },
  ],
  claims: [
    {
      claimId: "claim-real-conflict",
      label: "Liquidity depth",
      subject: SUBJECT,
      observations: [
        {
          observationId: "conflict-a",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          windowStart: "2026-01-05T11:00:00.000Z",
          windowEnd: "2026-01-05T12:00:00.000Z",
          value: { kind: "number", amount: "50000", unit: "USD" },
        },
        {
          observationId: "conflict-b",
          sourceLabel: "Beta Direct",
          status: "connected",
          observedAt: FRESH,
          windowStart: "2026-01-05T11:30:00.000Z",
          windowEnd: "2026-01-05T12:00:00.000Z",
          value: { kind: "number", amount: "90000", unit: "USD" },
        },
      ],
    },
    {
      claimId: "claim-unit-mismatch",
      label: "Liquidity depth in mixed units",
      subject: SUBJECT,
      observations: [
        {
          observationId: "unit-usd",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          windowStart: "2026-01-05T11:00:00.000Z",
          windowEnd: "2026-01-05T12:00:00.000Z",
          value: { kind: "number", amount: "50000", unit: "USD" },
        },
        {
          observationId: "unit-xlm",
          sourceLabel: "Beta Direct",
          status: "connected",
          observedAt: FRESH,
          windowStart: "2026-01-05T11:00:00.000Z",
          windowEnd: "2026-01-05T12:00:00.000Z",
          value: { kind: "number", amount: "125000", unit: "XLM" },
        },
      ],
    },
    {
      claimId: "claim-disjoint-windows",
      label: "Liquidity depth at different times",
      subject: SUBJECT,
      observations: [
        {
          observationId: "window-early",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: "2026-01-05T09:00:00.000Z",
          windowStart: "2026-01-05T08:00:00.000Z",
          windowEnd: "2026-01-05T09:00:00.000Z",
          value: { kind: "number", amount: "50000", unit: "USD" },
        },
        {
          observationId: "window-late",
          sourceLabel: "Beta Direct",
          status: "connected",
          observedAt: FRESH,
          windowStart: "2026-01-05T11:00:00.000Z",
          windowEnd: "2026-01-05T12:00:00.000Z",
          value: { kind: "number", amount: "90000", unit: "USD" },
        },
      ],
    },
    {
      claimId: "claim-free-text",
      label: "Issuer description",
      subject: SUBJECT,
      observations: [
        {
          observationId: "text-a",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "text", text: "Regulated issuer with monthly attestations." },
        },
        {
          observationId: "text-b",
          sourceLabel: "Beta Direct",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "text", text: "Issuer publishes quarterly reports only." },
        },
      ],
    },
  ],
};

/**
 * Stale and undated observations, an unavailable source, and a raw payload
 * carrying credential-shaped fields that must never reach the response.
 */
export const staleMissingSecretFields: EvidenceRequest = {
  reportId: "report-hygiene-003",
  generatedAt: GENERATED_AT,
  staleAfterSeconds: 900,
  families: [
    { familyId: "vendor-alpha", label: "Alpha Data", memberLabels: ["Alpha Primary"], rationale: "Operator A." },
  ],
  claims: [
    {
      claimId: "claim-hygiene",
      label: "Reserve attestation",
      subject: SUBJECT,
      observations: [
        {
          observationId: "hygiene-stale",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: STALE,
          value: { kind: "number", amount: "1000000", unit: "USD" },
          raw: {
            apiKey: "sk-live-should-never-appear",
            Authorization: "Bearer should-never-appear",
            walletSeed: "should-never-appear",
            signedXdr: "AAAAAgAAAA-should-never-appear",
            harmlessField: "also dropped, because the whole bag is dropped",
          },
        },
        {
          observationId: "hygiene-undated",
          sourceLabel: "Undeclared Source",
          status: "connected",
          value: { kind: "number", amount: "1000000", unit: "USD" },
        },
        {
          observationId: "hygiene-unavailable",
          sourceLabel: "Beta Direct",
          status: "unavailable",
          observedAt: FRESH,
          value: { kind: "number", amount: "999", unit: "USD" },
        },
      ],
    },
  ],
};

/** Two claims about assets that share a symbol on different chains. */
export const sameSymbolDifferentChains: EvidenceRequest = {
  reportId: "report-identity-004",
  generatedAt: GENERATED_AT,
  staleAfterSeconds: 900,
  families: [],
  claims: [
    {
      claimId: "claim-stellar",
      label: "Circulating supply",
      subject: SUBJECT,
      observations: [
        {
          observationId: "identity-stellar",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "1000000", unit: "USDC" },
        },
      ],
    },
    {
      claimId: "claim-ethereum",
      label: "Circulating supply",
      subject: OTHER_SUBJECT,
      observations: [
        {
          observationId: "identity-ethereum",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "44000000000", unit: "USDC" },
        },
      ],
    },
  ],
};

/** A claim whose every observation failed. */
export const uncoveredClaim: EvidenceRequest = {
  reportId: "report-uncovered-005",
  generatedAt: GENERATED_AT,
  staleAfterSeconds: 900,
  families: [],
  claims: [
    {
      claimId: "claim-nothing",
      label: "Audit status",
      subject: SUBJECT,
      observations: [
        { observationId: "nothing-a", sourceLabel: "Alpha Primary", status: "unavailable", observedAt: FRESH },
        { observationId: "nothing-b", sourceLabel: "Beta Direct", status: "unavailable", observedAt: FRESH },
      ],
    },
  ],
};

/** Valid report carrying no claims at all. */
export const emptyReport: EvidenceRequest = {
  reportId: "report-empty-006",
  generatedAt: GENERATED_AT,
  staleAfterSeconds: 900,
  families: [],
  claims: [],
};

/** Numerically equal values written differently must not conflict. */
export const equivalentNumberFormats: EvidenceRequest = {
  reportId: "report-formats-007",
  generatedAt: GENERATED_AT,
  staleAfterSeconds: 900,
  families: [
    { familyId: "vendor-alpha", label: "Alpha Data", memberLabels: ["Alpha Primary"], rationale: "Operator A." },
    { familyId: "vendor-beta", label: "Beta Feeds", memberLabels: ["Beta Direct"], rationale: "Operator B." },
  ],
  claims: [
    {
      claimId: "claim-formats",
      label: "Price",
      subject: SUBJECT,
      observations: [
        {
          observationId: "format-a",
          sourceLabel: "Alpha Primary",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "1.50", unit: "USD" },
        },
        {
          observationId: "format-b",
          sourceLabel: "Beta Direct",
          status: "connected",
          observedAt: FRESH,
          value: { kind: "number", amount: "1.5", unit: "USD" },
        },
      ],
    },
  ],
};
