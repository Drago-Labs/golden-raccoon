/**
 * Fixtures for saved run comparison.
 *
 * Runs are plain `AgentRunRecord` objects and the reader is a map from run id
 * to record, filtered by wallet the way storage would. No agent runs, no
 * provider is contacted and no clock is read.
 */
import type { AgentFinding, AgentResult, AgentRunRecord } from "@/server/types";
import type { RunReader } from "@/server/research/run-comparison/schema";

export const WALLET = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
export const OTHER_WALLET = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

function finding(label: string, severity: string, scoreImpact: number, detail = ""): AgentFinding {
  return { label, severity, detail: detail || `${label} detail`, scoreImpact } as AgentFinding;
}

function result(overrides: Partial<AgentResult> & Pick<AgentResult, "agent">): AgentResult {
  return {
    status: "ok",
    riskScore: 40,
    score: 40,
    riskLevel: "medium",
    verdict: "Acceptable",
    summary: "",
    findings: [],
    sources: [],
    dataQuality: {
      mode: "live",
      connectedSources: 3,
      unavailableSources: 0,
      mockSources: 0,
      sourceCount: 3,
      reliability: 0.9,
      lastCheckedAt: "2026-02-01T00:00:00.000Z",
    },
    confidence: 0.8,
    recommendedAction: "hold",
    blockingReasons: [],
    missingData: [],
    createdAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  } as AgentResult;
}

function run(overrides: Partial<AgentRunRecord> & Pick<AgentRunRecord, "id">): AgentRunRecord {
  return {
    walletAddress: WALLET,
    mode: "token_scan",
    inputSnapshot: { network: "ethereum", balanceUsd: 1000, holdings: ["USDC"] },
    targetToken: { symbol: "ACME", tokenAddress: "0x1234", chain: "ethereum" },
    status: "completed",
    recommendation: "hold",
    decisionScore: 40,
    confidence: 0.8,
    summary: "",
    results: [],
    createdAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  } as AgentRunRecord;
}

/** The earlier of two runs about the same token. */
export const RUN_EARLIER = run({
  id: "run-earlier",
  createdAt: "2026-02-01T00:00:00.000Z",
  results: [
    result({ agent: "portfolio", riskScore: 30, findings: [finding("Concentration", "medium", 10)] }),
    result({ agent: "onchain", riskScore: 50, findings: [finding("Unverified contract", "high", 25)] }),
    result({ agent: "news", riskScore: 20 }),
  ],
});

/**
 * The later run, with its results stored in a different order.
 *
 * Positional comparison would call every agent changed; alignment by name must
 * not.
 */
export const RUN_LATER_REORDERED = run({
  id: "run-later",
  createdAt: "2026-02-10T00:00:00.000Z",
  decisionScore: 55,
  recommendation: "reduce_exposure",
  results: [
    result({ agent: "news", riskScore: 20 }),
    result({ agent: "onchain", riskScore: 50, findings: [finding("Unverified contract", "high", 25)] }),
    result({ agent: "portfolio", riskScore: 30, findings: [finding("Concentration", "medium", 10)] }),
  ],
});

/** A later run where one agent is absent and another is new. */
export const RUN_AGENT_SET_CHANGED = run({
  id: "run-agents-changed",
  createdAt: "2026-02-12T00:00:00.000Z",
  results: [
    result({ agent: "portfolio", riskScore: 35 }),
    result({ agent: "social", riskScore: 60 }),
  ],
});

/** A later run whose onchain sources went dark and whose score moved. */
export const RUN_PROVIDER_OUTAGE = run({
  id: "run-outage",
  createdAt: "2026-02-14T00:00:00.000Z",
  decisionScore: 70,
  results: [
    result({
      agent: "onchain",
      riskScore: 75,
      dataQuality: {
        mode: "partial",
        connectedSources: 1,
        unavailableSources: 2,
        mockSources: 0,
        sourceCount: 3,
        reliability: 0.3,
        lastCheckedAt: "2026-02-14T00:00:00.000Z",
      },
      missingData: [{ field: "holderDistribution", reason: "provider unavailable", impact: "high" }],
    }),
    result({ agent: "portfolio", riskScore: 30, findings: [finding("Concentration", "medium", 10)] }),
    result({ agent: "news", riskScore: 20 }),
  ],
});

/** A run whose onchain agent carries the same finding label twice. */
export const RUN_AMBIGUOUS_FINDINGS = run({
  id: "run-ambiguous",
  createdAt: "2026-02-16T00:00:00.000Z",
  results: [
    result({
      agent: "onchain",
      riskScore: 55,
      findings: [finding("Liquidity concern", "medium", 10, "pool A"), finding("Liquidity concern", "high", 30, "pool B")],
    }),
  ],
});

/** A run with a single finding of that label, to pair against the ambiguous one. */
export const RUN_SINGLE_FINDING = run({
  id: "run-single-finding",
  createdAt: "2026-02-15T00:00:00.000Z",
  results: [result({ agent: "onchain", riskScore: 50, findings: [finding("Liquidity concern", "medium", 10, "pool A")] })],
});

/** A run with changed inputs. */
export const RUN_CHANGED_INPUTS = run({
  id: "run-changed-inputs",
  createdAt: "2026-02-18T00:00:00.000Z",
  inputSnapshot: { network: "ethereum", balanceUsd: 2500, holdings: ["USDC", "WETH"], newField: true },
  results: [result({ agent: "portfolio", riskScore: 30 })],
});

/** A run about a different token. */
export const RUN_OTHER_SUBJECT = run({
  id: "run-other-subject",
  targetToken: { symbol: "OTHER", tokenAddress: "0x9999", chain: "ethereum" },
  createdAt: "2026-02-20T00:00:00.000Z",
  results: [result({ agent: "portfolio", riskScore: 30 })],
});

/** A run in a different mode. */
export const RUN_OTHER_MODE = run({
  id: "run-other-mode",
  mode: "portfolio_review",
  createdAt: "2026-02-21T00:00:00.000Z",
  results: [result({ agent: "portfolio", riskScore: 30 })],
});

/** A run on another network. */
export const RUN_OTHER_NETWORK = run({
  id: "run-other-network",
  targetToken: { symbol: "ACME", tokenAddress: "0x1234", chain: "base" },
  createdAt: "2026-02-22T00:00:00.000Z",
  results: [result({ agent: "portfolio", riskScore: 30 })],
});

/** A run belonging to somebody else. */
export const RUN_OTHER_WALLET = run({
  id: "run-other-wallet",
  walletAddress: OTHER_WALLET,
  createdAt: "2026-02-23T00:00:00.000Z",
  results: [result({ agent: "portfolio", riskScore: 30 })],
});

/** A run that stored no agent result at all. */
export const RUN_NO_RESULTS = run({ id: "run-no-results", createdAt: "2026-02-24T00:00:00.000Z", results: [] });

export const ALL_RUNS: AgentRunRecord[] = [
  RUN_EARLIER,
  RUN_LATER_REORDERED,
  RUN_AGENT_SET_CHANGED,
  RUN_PROVIDER_OUTAGE,
  RUN_AMBIGUOUS_FINDINGS,
  RUN_SINGLE_FINDING,
  RUN_CHANGED_INPUTS,
  RUN_OTHER_SUBJECT,
  RUN_OTHER_MODE,
  RUN_OTHER_NETWORK,
  RUN_OTHER_WALLET,
  RUN_NO_RESULTS,
];

export type CountingRunReader = RunReader & { readCount: () => number; log: () => string[] };

/**
 * A reader that filters by wallet the way storage does.
 *
 * The service checks ownership again on the returned record, and one test
 * drives a deliberately leaky reader to prove that second check works.
 */
export function createRunReader(runs: AgentRunRecord[] = ALL_RUNS, options: { ignoreWallet?: boolean } = {}): CountingRunReader {
  let count = 0;
  const log: string[] = [];

  return {
    readCount: () => count,
    log: () => [...log],

    getRun({ runId, walletAddress }) {
      count += 1;
      log.push(runId);

      const found = runs.find((entry) => entry.id === runId);

      if (!found) return null;
      if (options.ignoreWallet) return found;

      return found.walletAddress.toLowerCase() === walletAddress.toLowerCase() ? found : null;
    },
  };
}

export function request(leftRunId: string, rightRunId: string, overrides: Record<string, unknown> = {}) {
  return { walletAddress: WALLET, leftRunId, rightRunId, ...overrides };
}
