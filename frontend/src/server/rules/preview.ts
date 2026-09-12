import type { CurrentRule } from "./schema";
import { resolveChainId } from "./strategyProfile";
import { listCandidates } from "@/server/discovery/store";

export interface CandidateSignal {
  id: string;
  canonicalKey?: string;
  assetKey?: string;
  chainId?: string;
  chain?: string;
  symbol?: string;
  tokenName?: string;
  liquidityUsd?: number;
  volume24hUsd?: number;
  riskScore?: number;
  categories?: string[];
  observedAt?: string;
}

export interface ObservationEvaluation {
  id: string;
  canonicalKey: string;
  symbol?: string;
  chainId: string;
  status: "matched" | "rejected";
  riskScore?: number;
  liquidityUsd?: number;
  reasons: string[];
  reason?: string;
}

export interface RulePreviewResult {
  totalEvaluated: number;
  totalSignals: number;
  matchedCount: number;
  rejectedCount: number;
  zeroMatches: boolean;
  message: string;
  matched: ObservationEvaluation[];
  rejected: ObservationEvaluation[];
  blocked: ObservationEvaluation[];
}

const DEFAULT_SAMPLE_SIGNALS: CandidateSignal[] = [
  {
    id: "sig_usdc_base",
    canonicalKey: "evm:base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    chainId: "base",
    symbol: "USDC",
    tokenName: "USD Coin",
    liquidityUsd: 50_000_000,
    volume24hUsd: 12_000_000,
    riskScore: 5,
    categories: [],
    observedAt: new Date().toISOString(),
  },
  {
    id: "sig_brett_base",
    canonicalKey: "evm:base:0x532f27101965dd16442e59d40670faf5ebb142e4",
    chainId: "base",
    symbol: "BRETT",
    tokenName: "Brett",
    liquidityUsd: 15_000_000,
    volume24hUsd: 4_500_000,
    riskScore: 45,
    categories: ["meme"],
    observedAt: new Date().toISOString(),
  },
  {
    id: "sig_lowliq_goat",
    canonicalKey: "evm:goat:0x1111111111111111111111111111111111111111",
    chainId: "goat",
    symbol: "LOWL",
    tokenName: "Low Liquidity Token",
    liquidityUsd: 5_000,
    volume24hUsd: 1_200,
    riskScore: 78,
    categories: ["low_liquidity", "new_launch"],
    observedAt: new Date().toISOString(),
  },
  {
    id: "sig_xlm_stellar",
    canonicalKey: "stellar:native:xlm",
    chainId: "stellar-pubnet",
    symbol: "XLM",
    tokenName: "Lumen",
    liquidityUsd: 200_000_000,
    volume24hUsd: 35_000_000,
    riskScore: 8,
    categories: [],
    observedAt: new Date().toISOString(),
  },
  {
    id: "sig_highrisk_arb",
    canonicalKey: "evm:arbitrum:0x9999999999999999999999999999999999999999",
    chainId: "arbitrum",
    symbol: "RISK",
    tokenName: "High Risk Asset",
    liquidityUsd: 80_000,
    volume24hUsd: 300_000,
    riskScore: 92,
    categories: ["unaudited"],
    observedAt: new Date().toISOString(),
  },
];

/**
 * Evaluate a single recorded signal against candidate rule criteria.
 */
export function evaluateSignalAgainstRule(
  signal: CandidateSignal,
  rule: CurrentRule,
): ObservationEvaluation {
  const reasons: string[] = [];

  const rawChain = signal.chainId ?? signal.chain ?? "";
  const resolvedChain = resolveChainId(rawChain) ?? rawChain.toLowerCase();
  const allowedChains = rule.allowedChains ?? [];
  const chainMatches = allowedChains.some((c) => {
    const rc = resolveChainId(c) ?? c.toLowerCase();
    return rc === resolvedChain;
  });

  if (!chainMatches) {
    reasons.push(`Chain not allowed: Chain "${rawChain}" is not in allowed chains`);
  }

  const rawAssetKey = signal.canonicalKey ?? signal.assetKey ?? signal.id;
  const assetKey = rawAssetKey.toLowerCase();
  const blockedAssets = rule.blockedAssets ?? [];
  const isAssetBlocked = blockedAssets.some((b) => b.toLowerCase() === assetKey);
  if (isAssetBlocked) {
    reasons.push(`Blocked asset: Asset "${signal.symbol ?? rawAssetKey}" is in blocked assets`);
  }

  const signalCategories = signal.categories ?? [];
  const blockedCategories = rule.blockedCategories ?? [];
  for (const cat of signalCategories) {
    if (blockedCategories.includes(cat as (typeof rule.blockedCategories)[number])) {
      reasons.push(`Blocked category: Category "${cat}" is blocked by policy`);
    }
  }

  if (signal.liquidityUsd !== undefined && (rule.minLiquidityUsd ?? 0) > 0) {
    if (signal.liquidityUsd < rule.minLiquidityUsd) {
      reasons.push(
        `Below min liquidity: Liquidity ($${signal.liquidityUsd.toLocaleString()}) is below minimum $${rule.minLiquidityUsd.toLocaleString()}`,
      );
    }
  }

  if (signal.riskScore !== undefined) {
    if (signal.riskScore > (rule.maxBuyRisk ?? 100)) {
      reasons.push(
        `Risk score (${signal.riskScore}) exceeds max buy risk ceiling (${rule.maxBuyRisk})`,
      );
    }
  }

  const status = reasons.length === 0 ? "matched" : "rejected";

  return {
    id: signal.id,
    signal,
    canonicalKey: rawAssetKey,
    symbol: signal.symbol,
    chainId: rawChain,
    status,
    riskScore: signal.riskScore,
    liquidityUsd: signal.liquidityUsd,
    reasons,
    reason: reasons[0] ?? "",
  };
}

/**
 * Evaluate candidate rule against recent recorded signals without persisting.
 */
export function previewRule(
  rule: CurrentRule,
  customSignals?: CandidateSignal[],
): RulePreviewResult {
  let signalsToEvaluate: CandidateSignal[] = [];

  if (customSignals && customSignals.length > 0) {
    signalsToEvaluate = customSignals;
  } else {
    try {
      const candidates = listCandidates();
      if (candidates.length > 0) {
        signalsToEvaluate = candidates.map((c) => ({
          id: `candidate_${c.canonicalKey}`,
          canonicalKey: c.canonicalKey,
          chainId: c.chainId,
          symbol: c.symbol,
          tokenName: c.tokenName,
          liquidityUsd: c.market?.liquidityUsd,
          volume24hUsd: c.market?.volume24hUsd,
          riskScore: c.riskScore,
          observedAt: c.lastObservedAt,
        }));
      }
    } catch {
      signalsToEvaluate = [];
    }

    if (signalsToEvaluate.length === 0) {
      signalsToEvaluate = DEFAULT_SAMPLE_SIGNALS;
    }
  }

  const matched: ObservationEvaluation[] = [];
  const rejected: ObservationEvaluation[] = [];

  for (const signal of signalsToEvaluate) {
    const evalResult = evaluateSignalAgainstRule(signal, rule);
    if (evalResult.status === "matched") {
      matched.push(evalResult);
    } else {
      rejected.push(evalResult);
    }
  }

  const totalEvaluated = signalsToEvaluate.length;
  const matchedCount = matched.length;
  const rejectedCount = rejected.length;
  const zeroMatches = matchedCount === 0;

  const message = zeroMatches
    ? `Rule matches 0 of ${totalEvaluated} recorded signals. No observations meet all policy criteria.`
    : `Rule matches ${matchedCount} of ${totalEvaluated} recorded signals.`;

  return {
    totalEvaluated,
    totalSignals: totalEvaluated,
    matchedCount,
    rejectedCount,
    zeroMatches,
    message,
    matched,
    rejected,
    blocked: rejected,
  };
}

export const previewRuleEvaluation = previewRule;
