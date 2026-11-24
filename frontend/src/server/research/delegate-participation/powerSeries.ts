import { DELEGATE_LIMITS } from "./limits";
import type { DelegatePower, PowerCheckpoint } from "./schema";

export type PowerSeries = {
  delegate: string;
  /** Checkpoints inside the scanned range, oldest first. */
  checkpoints: PowerCheckpoint[];
  truncated: boolean;
};

/**
 * Rebuilds each delegate's voting power over time from the token's own
 * `DelegateVotesChanged` checkpoints: every event states the power the
 * delegate holds after the change, so the series is read from the chain
 * rather than accumulated from deltas.
 */
export function buildPowerSeries(checkpoints: PowerCheckpoint[]): Map<string, PowerSeries> {
  const byDelegate = new Map<string, PowerSeries>();

  for (const checkpoint of [...checkpoints].sort(
    (left, right) => left.blockNumber - right.blockNumber || left.logIndex - right.logIndex,
  )) {
    const existing = byDelegate.get(checkpoint.delegate) ?? {
      delegate: checkpoint.delegate,
      checkpoints: [],
      truncated: false,
    };
    if (existing.checkpoints.length >= DELEGATE_LIMITS.maxCheckpointsPerDelegate) {
      existing.truncated = true;
    } else {
      existing.checkpoints.push(checkpoint);
    }
    byDelegate.set(checkpoint.delegate, existing);
  }

  return byDelegate;
}

/**
 * The delegate's voting power at a block, from the latest checkpoint at or
 * before it. `null` means the scanned range holds no checkpoint that early:
 * the power is unknown, not zero, unless the range reaches the chain's start.
 */
export function powerAt(series: PowerSeries | undefined, blockNumber: number, coversHistory: boolean): bigint | null {
  if (!series || !series.checkpoints.length) return coversHistory ? 0n : null;
  let latest: PowerCheckpoint | null = null;
  for (const checkpoint of series.checkpoints) {
    if (checkpoint.blockNumber <= blockNumber) latest = checkpoint;
    else break;
  }
  if (latest) return BigInt(latest.newPower);
  // Before the first checkpoint in range: the chain's own earlier state is
  // only known when the range started at block zero.
  return coversHistory ? 0n : BigInt(series.checkpoints[0].previousPower);
}

/** Power at the end of the scanned range. */
export function currentPower(series: PowerSeries | undefined, toBlock: number, coversHistory: boolean): bigint | null {
  return powerAt(series, toBlock, coversHistory);
}

/** The largest power the delegate held at any checkpoint in the range. */
export function peakPower(series: PowerSeries | undefined): bigint | null {
  if (!series || !series.checkpoints.length) return null;
  return series.checkpoints.reduce((largest, checkpoint) => {
    const value = BigInt(checkpoint.newPower);
    return value > largest ? value : largest;
  }, 0n);
}

export function formatSeries(series: PowerSeries | undefined, explorerTxUrl: string): DelegatePower[] {
  return (series?.checkpoints ?? []).map((checkpoint) => ({
    blockNumber: checkpoint.blockNumber,
    powerUnits: checkpoint.newPower,
    deltaUnits: checkpoint.deltaPower,
    txId: checkpoint.txId,
    txUrl: `${explorerTxUrl}${checkpoint.txId}`,
  }));
}
