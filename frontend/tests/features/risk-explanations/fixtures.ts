/**
 * Fixtures for the risk explanation workbench.
 *
 * Every fixture is a plain object shaped like the read-only projection of
 * `RiskReport` the feature validates. They carry no wallet secret, no live
 * provider response and no network access; each one isolates a single
 * behaviour the acceptance criteria name.
 */
import type { ExplanationReport } from "@/server/research/risk-explanations/schema";

function source(label: string, overrides: Partial<ExplanationReport["sources"][number]> = {}) {
  return { label, status: "connected" as const, url: `https://example.test/${label.toLowerCase().replace(/\s+/g, "-")}`, ...overrides };
}

/**
 * A report where every factor names a listed source, plus one factor that names
 * no source at all. Exercises "complete and unlinked factors".
 */
export const completeAndUnlinkedReport: ExplanationReport = {
  id: "report-complete-001",
  chain: "ethereum",
  contractAddress: "0x1111111111111111111111111111111111111111",
  symbol: "ACME",
  tokenName: "Acme Token",
  buyRisk: 62,
  confidence: 0.71,
  verdict: "watch",
  summary: "Liquidity is thin and ownership controls remain open.",
  topReasons: ["Thin liquidity", "Owner can mint"],
  input: { chain: "ethereum", assetType: "contract", contractAddress: "0x1111111111111111111111111111111111111111" },
  agentCards: [
    {
      agent: "onchain",
      displayName: "On-chain analyst",
      score: 68,
      scoreKind: "risk",
      confidence: 0.8,
      status: "complete",
      summary: "Owner controls are unrenounced.",
      factors: [
        {
          label: "Owner can mint",
          category: "owner_controls",
          impact: 72,
          severity: "high",
          detail: "The owner retains an unrestricted mint function.",
          sourceLabel: "GoPlus",
          direction: "risk_increase",
        },
        {
          label: "Liquidity depth",
          category: "liquidity",
          impact: 54,
          severity: "medium",
          detail: "Pooled liquidity is below the comfortable exit threshold.",
          sourceLabel: "DexScreener",
          direction: "risk_increase",
        },
        {
          label: "Contract verified",
          category: "owner_controls",
          impact: 0,
          severity: "low",
          detail: "Source code is verified on the block explorer.",
          sourceLabel: "Etherscan",
          direction: "neutral",
        },
      ],
      criticalFactors: [],
      sources: [source("GoPlus"), source("DexScreener"), source("Etherscan")],
      missingData: [],
    },
    {
      agent: "decision",
      displayName: "Decision core",
      score: 62,
      scoreKind: "decision",
      confidence: 0.71,
      status: "complete",
      summary: "Weighted aggregation across specialist agents.",
      factors: [
        {
          label: "Final buy risk formula",
          category: "decision_logic",
          impact: 62,
          severity: "medium",
          detail: "Final buy risk is 62/100 from weighted specialist agents.",
          sourceLabel: "Decision Core",
          direction: "risk_increase",
        },
        {
          label: "What would change this decision",
          category: "decision_logic",
          impact: 0,
          severity: "low",
          detail: "Renouncing ownership would lower the score materially.",
          direction: "neutral",
        },
      ],
      criticalFactors: [],
      sources: [source("Decision Core", { url: undefined })],
      missingData: [],
    },
  ],
  sources: [source("GoPlus"), source("DexScreener"), source("Etherscan"), source("Decision Core", { url: undefined })],
  missingData: [],
  createdAt: "2026-01-04T10:00:00.000Z",
};

/**
 * A report whose factors carry no usable weights, whose directions contradict
 * their impact signs, and which names a source the report never listed.
 */
export const nonAdditiveAndConflictingReport: ExplanationReport = {
  id: "report-conflict-002",
  chain: "stellar-pubnet",
  symbol: "USDC",
  buyRisk: 48,
  confidence: 0.4,
  verdict: "manual_review",
  summary: "Sources disagree about issuer controls.",
  topReasons: ["Conflicting issuer signals"],
  input: { chain: "stellar-pubnet", assetType: "classic", issuer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", symbol: "USDC" },
  agentCards: [
    {
      agent: "onchain",
      displayName: "On-chain analyst",
      score: 55,
      scoreKind: "risk",
      confidence: 0.5,
      status: "partial",
      summary: "Issuer flags are partially readable.",
      factors: [
        {
          label: "Issuer auth flags",
          category: "owner_controls",
          impact: -30,
          severity: "high",
          detail: "Directions and impacts disagree in the upstream record.",
          sourceLabel: "Horizon",
          direction: "risk_increase",
        },
        {
          label: "Clawback enabled",
          category: "owner_controls",
          impact: 84,
          severity: "critical",
          detail: "The issuer can claw back holdings.",
          sourceLabel: "Unlisted Provider",
          direction: "risk_increase",
        },
      ],
      criticalFactors: [
        {
          label: "Clawback enabled",
          category: "owner_controls",
          impact: 84,
          severity: "critical",
          detail: "The issuer can claw back holdings.",
          sourceLabel: "Unlisted Provider",
          direction: "risk_increase",
        },
      ],
      sources: [source("Horizon")],
      missingData: [
        { field: "issuer_home_domain", reason: "The issuer TOML could not be fetched.", impact: "medium", canRetry: true },
      ],
    },
  ],
  sources: [source("Horizon")],
  missingData: [{ field: "liquidity_depth", reason: "The market provider was unavailable.", impact: "high", canRetry: true }],
  createdAt: "2026-01-05T10:00:00.000Z",
};

/**
 * Two reports that share a symbol on different networks. Their canonical
 * identities must not collapse onto one key.
 */
export const sameSymbolTestnetReport: ExplanationReport = {
  ...nonAdditiveAndConflictingReport,
  id: "report-testnet-003",
  chain: "stellar-testnet",
  input: { ...nonAdditiveAndConflictingReport.input, chain: "stellar-testnet" },
};

/** A schema-valid report that recorded no factors at all. */
export const emptyReport: ExplanationReport = {
  id: "report-empty-004",
  chain: "base",
  symbol: "NONE",
  buyRisk: 0,
  confidence: 0,
  verdict: "hold",
  summary: "",
  topReasons: [],
  input: { chain: "base" },
  agentCards: [],
  sources: [],
  missingData: [],
  createdAt: "2026-01-06T10:00:00.000Z",
};

/**
 * A report whose factors carry weights that reproduce the agent score exactly.
 * This is the only shape for which an additive reconciliation is honest.
 */
export const additiveReport: ExplanationReport = {
  id: "report-additive-005",
  chain: "ethereum",
  symbol: "WGT",
  buyRisk: 40,
  confidence: 0.9,
  verdict: "watch",
  summary: "Weighted factors reproduce the agent score.",
  topReasons: [],
  input: { chain: "ethereum" },
  agentCards: [
    {
      agent: "onchain",
      displayName: "On-chain analyst",
      score: 40,
      scoreKind: "risk",
      confidence: 0.9,
      status: "complete",
      summary: "Two weighted factors.",
      factors: [
        {
          label: "Alpha",
          category: "liquidity",
          impact: 20,
          weight: 1,
          severity: "low",
          detail: "First weighted factor.",
          sourceLabel: "GoPlus",
          direction: "risk_increase",
        },
        {
          label: "Beta",
          category: "liquidity",
          impact: 60,
          weight: 1,
          severity: "high",
          detail: "Second weighted factor.",
          sourceLabel: "GoPlus",
          direction: "risk_increase",
        },
      ],
      criticalFactors: [],
      sources: [source("GoPlus")],
      missingData: [],
    },
  ],
  sources: [source("GoPlus")],
  missingData: [],
  createdAt: "2026-01-07T10:00:00.000Z",
};

/**
 * Two agents publishing a factor with the same label. Rows must stay distinct.
 */
export const duplicateLabelReport: ExplanationReport = {
  ...completeAndUnlinkedReport,
  id: "report-duplicate-006",
  agentCards: [
    completeAndUnlinkedReport.agentCards[0],
    {
      ...completeAndUnlinkedReport.agentCards[1],
      factors: [
        ...completeAndUnlinkedReport.agentCards[1].factors,
        {
          label: "Liquidity depth",
          category: "liquidity",
          impact: 30,
          severity: "medium",
          detail: "The decision core restated the liquidity signal.",
          sourceLabel: "Decision Core",
          direction: "risk_increase",
        },
      ],
    },
  ],
};

/** Deep clone helper so a test can prove analysis did not mutate its input. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
