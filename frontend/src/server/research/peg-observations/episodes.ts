import {
  type DeviationEpisode,
  type NormalizedObservation,
} from "./schema";

export type EpisodeDetectionResult = {
  episodes: DeviationEpisode[];
  activeEpisodesCount: number;
  recoveredEpisodesCount: number;
  interruptedEpisodesCount: number;
};

/**
 * Identifies peg deviation episodes exceeding the specified basis-point threshold.
 * Enforces documented gap rules: unobserved gaps exceeding tolerance interrupt the episode
 * and never imply continuous deviation or unverified recovery.
 */
export function detectDeviationEpisodes(
  observations: NormalizedObservation[],
  thresholdBps: number,
  options?: {
    gapToleranceMs?: number;
    now?: () => number;
  },
): EpisodeDetectionResult {
  const gapToleranceMs = options?.gapToleranceMs ?? 3_600_000;
  const episodes: DeviationEpisode[] = [];

  let currentEpisode: {
    id: string;
    startIndex: number;
    startTime: number;
    lastObsIndex: number;
    lastObsTime: number;
    peakDeviationBps: number;
    peakTimestamp: number;
    direction: "above" | "below";
    observationsCount: number;
  } | null = null;

  for (let i = 0; i < observations.length; i += 1) {
    const obs = observations[i];
    const deviation = obs.deviationBps;

    if (currentEpisode) {
      const deltaFromLast = obs.timestamp - currentEpisode.lastObsTime;

      if (deltaFromLast > gapToleranceMs) {
        episodes.push({
          id: currentEpisode.id,
          startIndex: currentEpisode.startIndex,
          endIndex: currentEpisode.lastObsIndex,
          startTime: currentEpisode.startTime,
          endTime: currentEpisode.lastObsTime,
          durationMs: currentEpisode.lastObsTime - currentEpisode.startTime,
          peakDeviationBps: currentEpisode.peakDeviationBps,
          peakTimestamp: currentEpisode.peakTimestamp,
          thresholdBps,
          status: "interrupted_by_gap",
          recoveryDurationMs: null,
          direction: currentEpisode.direction,
          observationsCount: currentEpisode.observationsCount,
        });
        currentEpisode = null;
      }
    }

    if (deviation !== null && Math.abs(deviation) >= thresholdBps) {
      if (!currentEpisode) {
        currentEpisode = {
          id: `episode-${episodes.length + 1}`,
          startIndex: i,
          startTime: obs.timestamp,
          lastObsIndex: i,
          lastObsTime: obs.timestamp,
          peakDeviationBps: deviation,
          peakTimestamp: obs.timestamp,
          direction: deviation >= 0 ? "above" : "below",
          observationsCount: 1,
        };
      } else {
        currentEpisode.lastObsIndex = i;
        currentEpisode.lastObsTime = obs.timestamp;
        currentEpisode.observationsCount += 1;

        if (Math.abs(deviation) > Math.abs(currentEpisode.peakDeviationBps)) {
          currentEpisode.peakDeviationBps = deviation;
          currentEpisode.peakTimestamp = obs.timestamp;
        }
      }
    } else if (currentEpisode) {
      if (deviation !== null && Math.abs(deviation) < thresholdBps) {
        const recoveryDuration = obs.timestamp - currentEpisode.startTime;
        episodes.push({
          id: currentEpisode.id,
          startIndex: currentEpisode.startIndex,
          endIndex: i,
          startTime: currentEpisode.startTime,
          endTime: obs.timestamp,
          durationMs: recoveryDuration,
          peakDeviationBps: currentEpisode.peakDeviationBps,
          peakTimestamp: currentEpisode.peakTimestamp,
          thresholdBps,
          status: "recovered",
          recoveryDurationMs: recoveryDuration,
          direction: currentEpisode.direction,
          observationsCount: currentEpisode.observationsCount + 1,
        });
        currentEpisode = null;
      }
    }
  }

  if (currentEpisode) {
    episodes.push({
      id: currentEpisode.id,
      startIndex: currentEpisode.startIndex,
      endIndex: null,
      startTime: currentEpisode.startTime,
      endTime: null,
      durationMs: currentEpisode.lastObsTime - currentEpisode.startTime,
      peakDeviationBps: currentEpisode.peakDeviationBps,
      peakTimestamp: currentEpisode.peakTimestamp,
      thresholdBps,
      status: "active",
      recoveryDurationMs: null,
      direction: currentEpisode.direction,
      observationsCount: currentEpisode.observationsCount,
    });
  }

  const activeCount = episodes.filter((ep) => ep.status === "active").length;
  const recoveredCount = episodes.filter((ep) => ep.status === "recovered").length;
  const interruptedCount = episodes.filter((ep) => ep.status === "interrupted_by_gap").length;

  return {
    episodes,
    activeEpisodesCount: activeCount,
    recoveredEpisodesCount: recoveredCount,
    interruptedEpisodesCount: interruptedCount,
  };
}
