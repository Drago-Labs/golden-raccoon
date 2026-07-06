import type { AgentResult } from "@/server/types";

export type ReplaySnapshot = {
  agent: AgentResult["agent"];
  sourceSnapshotHash: string;
  riskScore: number;
  recommendedAction: AgentResult["recommendedAction"];
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

export function compareReplaySnapshot(snapshot: ReplaySnapshot, replayed: AgentResult) {
  const compatible = snapshot.agent === replayed.agent && snapshot.recommendedAction === replayed.recommendedAction && Math.abs(snapshot.riskScore - replayed.riskScore) <= 3;

  return {
    compatible,
    migrationNote: compatible ? undefined : "Replay drift detected; attach migration note before accepting changed decision behavior.",
  };
}
