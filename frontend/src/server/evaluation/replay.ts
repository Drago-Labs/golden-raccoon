import type { AgentResult } from "@/server/types";

export type ReplaySnapshot = {
  agent: AgentResult["agent"];
  sourceSnapshotHash: string;
  riskScore: number;
  recommendedAction: AgentResult["recommendedAction"];
  chainFamily?: "evm" | "stellar";
  fixtureName?: string;
  migrationNote?: string;
};

export function createReplaySnapshot(result: AgentResult, sourceSnapshotHash: string): ReplaySnapshot {
  return {
    agent: result.agent,
    sourceSnapshotHash,
    riskScore: result.riskScore,
    recommendedAction: result.recommendedAction,
  };
}

export function createStellarReplaySnapshot(
  result: AgentResult,
  sourceSnapshotHash: string,
  fixtureName: string,
): ReplaySnapshot {
  return {
    agent: result.agent,
    sourceSnapshotHash,
    riskScore: result.riskScore,
    recommendedAction: result.recommendedAction,
    chainFamily: "stellar",
    fixtureName,
  };
}

export function compareReplaySnapshot(snapshot: ReplaySnapshot, replayed: AgentResult) {
  const compatible = snapshot.agent === replayed.agent && snapshot.recommendedAction === replayed.recommendedAction && Math.abs(snapshot.riskScore - replayed.riskScore) <= 3;

  return {
    compatible,
    migrationNote: compatible ? undefined : "Replay drift detected; attach migration note before accepting changed decision behavior.",
  };
}

/**
 * Stellar-specific replay snapshots registry.
 * Each entry records the expected deterministic outcome for a golden fixture.
 * Update these when the Stellar onchain agent's scoring logic intentionally changes.
 */
export const stellarReplaySnapshots: Record<string, Omit<ReplaySnapshot, "sourceSnapshotHash">> = {
  stellar_xlm: {
    agent: "onchain",
    riskScore: 20,
    recommendedAction: "hold",
    chainFamily: "stellar",
    fixtureName: "stellar_xlm",
    migrationNote: "Native XLM should be low risk with no issuer controls.",
  },
  stellar_known_classic: {
    agent: "onchain",
    riskScore: 15,
    recommendedAction: "hold",
    chainFamily: "stellar",
    fixtureName: "stellar_known_classic",
    migrationNote: "Known classic asset with clean flags and adequate liquidity should be low risk.",
  },
  stellar_restricted_asset: {
    agent: "onchain",
    riskScore: 34,
    recommendedAction: "watch",
    chainFamily: "stellar",
    fixtureName: "stellar_restricted_asset",
    migrationNote: "Restricted asset with clawback and auth flags should be medium risk.",
  },
  stellar_sac: {
    agent: "onchain",
    riskScore: 15,
    recommendedAction: "hold",
    chainFamily: "stellar",
    fixtureName: "stellar_sac",
    migrationNote: "Stellar Asset Contract with classic backing should be low risk.",
  },
  stellar_sep41: {
    agent: "onchain",
    riskScore: 46,
    recommendedAction: "watch",
    chainFamily: "stellar",
    fixtureName: "stellar_sep41",
    migrationNote: "Generic WASM contract without issuer backing should be medium risk with reduced confidence.",
  },
  stellar_invalid_issuer: {
    agent: "onchain",
    riskScore: 74,
    recommendedAction: "manual_review",
    chainFamily: "stellar",
    fixtureName: "stellar_invalid_issuer",
    migrationNote: "Asset with unconfirmed issuer should be high/critical risk.",
  },
  stellar_unknown_contract: {
    agent: "onchain",
    riskScore: 71,
    recommendedAction: "manual_review",
    chainFamily: "stellar",
    fixtureName: "stellar_unknown_contract",
    migrationNote: "Contract address with no deployed code should be high/critical risk.",
  },
  stellar_unavailable_provider: {
    agent: "onchain",
    riskScore: 77,
    recommendedAction: "manual_review",
    chainFamily: "stellar",
    fixtureName: "stellar_unavailable_provider",
    migrationNote: "Unavailable Stellar RPC should produce high risk with reduced confidence.",
  },
};

