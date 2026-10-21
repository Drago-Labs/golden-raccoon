/**
 * Reads historical score snapshots through the existing
 * `listRiskPublicationHistory` read API, without touching its storage.
 *
 * This module never imports the history index's internal store, never
 * calls `recordRiskPublication`, and never resets or mutates it — it is
 * a read-only adapter from `RiskPublicationRecord` to this feature's own
 * `ScoreSnapshot` shape.
 */
import { listRiskPublicationHistory } from "@/server/stellar/riskHistory";
import { SCORE_CALIBRATION_LIMITS } from "./limits";
import type { ScoreSnapshot } from "./schema";

export function readScoreSnapshots(network: "testnet" | "pubnet"): ScoreSnapshot[] {
  const records = listRiskPublicationHistory(network === "pubnet" ? "stellar-pubnet" : "stellar-testnet");

  return records.slice(0, SCORE_CALIBRATION_LIMITS.maxSnapshotsConsidered).map(
    (record) =>
      ({
        snapshotId: record.id,
        assetKey: record.assetKey,
        assetLabel: record.assetLabel,
        score: record.score,
        publishedAt: record.publishedAt,
      }) satisfies ScoreSnapshot,
  );
}
