import type { ScoreCalibrationDeps } from "@/server/research/score-calibration/service";
import type { ScoreSnapshot } from "@/server/research/score-calibration/schema";

export function snapshot(partial: Partial<ScoreSnapshot> & { snapshotId: string }): ScoreSnapshot {
  return {
    assetKey: "USDX:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    assetLabel: "USDX",
    score: 50,
    publishedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

export function aggregationRecord(open: string, low: string, high: string, timestamp: string): { open: string; low: string; high: string; close: string; timestamp: string } {
  return { open, low, high, close: low, timestamp };
}

export function stubHorizonFetch(records: { open: string; low: string; high: string; close: string; timestamp: string }[], status = 200) {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ _embedded: { records } }),
    }) as unknown as Response) as unknown as typeof fetch;
}

export function noopDeps(): ScoreCalibrationDeps {
  return {
    readScoreSnapshots: () => [],
    detectLargeDrawdown: async () => ({ outcome: "unsupported", reason: "price_data_unavailable", issues: ["stub"] }),
    detectDepeg: () => ({ outcome: "unsupported", reason: "outcome_not_configured", issues: ["stub"] }),
    detectIncident: () => ({ outcome: "unsupported", reason: "outcome_not_configured", issues: ["stub"] }),
  };
}

export function request(overrides: Record<string, unknown> = {}) {
  return { outcomeType: "large_drawdown", horizonDays: 30, network: "pubnet", ...overrides };
}
