/**
 * How provider coverage changed, kept apart from how scores changed.
 *
 * This is the module the feature's central caveat lives in. When an agent's
 * score moves *and* its sources went dark between the runs, those are two
 * facts. The report states both, with their own timestamps, and explicitly
 * declines to say the second caused the first — because a stored record does
 * not contain that information, and asserting it would be a guess a user would
 * act on.
 */
import type { AgentResult, SourceDataQuality } from "@/server/types";
import type { AgentPair } from "./alignment";
import type { QualityChange } from "./schema";

function snapshot(result: AgentResult | null): QualityChange["left"] {
  if (!result) return null;

  const quality = result.dataQuality as SourceDataQuality | undefined;

  if (!quality) return null;

  return {
    mode: String(quality.mode ?? "unknown"),
    connectedSources: Number(quality.connectedSources ?? 0),
    unavailableSources: Number(quality.unavailableSources ?? 0),
    reliability: Number(quality.reliability ?? 0),
    lastCheckedAt: typeof quality.lastCheckedAt === "string" ? quality.lastCheckedAt : null,
  };
}

export function diffQuality(pairs: AgentPair[]): QualityChange[] {
  return pairs.map((pair) => {
    const left = snapshot(pair.left);
    const right = snapshot(pair.right);

    const coverageDropped =
      left !== null && right !== null && (right.connectedSources < left.connectedSources || right.unavailableSources > left.unavailableSources);

    return {
      agent: pair.agent,
      left,
      right,
      coverageDropped,
      note: coverageDropped
        ? "Fewer sources answered in the second run. That is a fact about provider coverage; whether it moved this agent's score is not recorded and is not claimed here."
        : left === null || right === null
          ? "Data quality was not recorded for both runs, so coverage cannot be compared."
          : "Provider coverage is unchanged between the two runs.",
    };
  });
}

/** True when the score moved and coverage dropped in the same agent. */
export function coOccurringDrop(change: QualityChange, scoreDelta: number | null): boolean {
  return change.coverageDropped && scoreDelta !== null && scoreDelta !== 0;
}
