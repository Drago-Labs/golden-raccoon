/**
 * Find the ledger that was already closed at a moment, and the sequences
 * around a ledger.
 *
 * The match is the greatest sequence whose close time is at or before the
 * moment. A later close is not used, and a moment before the first probed
 * ledger is not given ledger 1 by default. The five-second spacing only
 * centres the search; the close time on the header decides.
 */
import { NetworkCongestionError } from "./errors";
import { CONGESTION_LIMITS } from "./limits";

export type ClosedHeader = {
  sequence: number;
  closedAt: string;
};

export function expandAround(sequence: number, radius: number): { fromSequence: number; toSequence: number } {
  const safeRadius = Math.max(0, radius);

  return {
    fromSequence: Math.max(1, sequence - safeRadius),
    toSequence: sequence + safeRadius,
  };
}

export function searchBounds(input: {
  latestSequence: number;
  latestClosedAt: string;
  at: string;
  slackLedgers?: number;
  nominalCloseSeconds?: number;
}): { low: number; high: number; estimate: number } {
  const latestClosedAtMs = Date.parse(input.latestClosedAt);
  const targetMs = Date.parse(input.at);

  if (!Number.isFinite(latestClosedAtMs) || !Number.isFinite(targetMs)) {
    throw new NetworkCongestionError("invalid_request", "A close time could not be read.");
  }

  if (targetMs > latestClosedAtMs) {
    throw new NetworkCongestionError("timestamp_not_closed", "No ledger had closed by that time. The latest close is earlier.");
  }

  const slack = input.slackLedgers ?? CONGESTION_LIMITS.timestampSlackLedgers;
  const closeSeconds = input.nominalCloseSeconds ?? CONGESTION_LIMITS.nominalCloseSeconds;
  const estimatedBack = Math.floor((latestClosedAtMs - targetMs) / (closeSeconds * 1_000));
  const estimate = Math.max(1, input.latestSequence - estimatedBack);

  return {
    low: Math.max(1, estimate - slack),
    high: Math.min(input.latestSequence, estimate + slack),
    estimate,
  };
}

export async function resolveClosedLedger(input: {
  latest: ClosedHeader;
  at: string;
  readHeader: (sequence: number) => Promise<ClosedHeader | null>;
  maxProbes?: number;
  slackLedgers?: number;
}): Promise<{ sequence: number; closedAt: string; probes: number }> {
  const targetMs = Date.parse(input.at);
  const latestMs = Date.parse(input.latest.closedAt);

  if (!Number.isFinite(targetMs) || !Number.isFinite(latestMs)) {
    throw new NetworkCongestionError("invalid_request", "A close time could not be read.");
  }

  if (targetMs > latestMs) {
    throw new NetworkCongestionError("timestamp_not_closed", "No ledger had closed by that time. The latest close is earlier.");
  }

  if (targetMs === latestMs) {
    return { sequence: input.latest.sequence, closedAt: input.latest.closedAt, probes: 0 };
  }

  const bounds = searchBounds({
    latestSequence: input.latest.sequence,
    latestClosedAt: input.latest.closedAt,
    at: input.at,
    slackLedgers: input.slackLedgers,
  });
  const maxProbes = input.maxProbes ?? CONGESTION_LIMITS.maxTimestampProbes;
  let low = bounds.low;
  let high = bounds.high;
  let match: ClosedHeader | null = null;
  let probes = 0;

  while (low <= high && probes < maxProbes) {
    const probe = low + Math.floor((high - low) / 2);
    probes += 1;
    const header = await input.readHeader(probe);

    if (!header || header.sequence !== probe) {
      throw new NetworkCongestionError("ledger_not_found", `Ledger ${probe} was not available while resolving the timestamp.`);
    }

    const closedMs = Date.parse(header.closedAt);

    if (!Number.isFinite(closedMs)) {
      throw new NetworkCongestionError("provider_unavailable", `Ledger ${probe} did not include a close time.`);
    }

    if (closedMs <= targetMs) {
      match = header;
      low = probe + 1;
    } else {
      high = probe - 1;
    }
  }

  if (!match) {
    throw new NetworkCongestionError("timestamp_not_closed", "No probed ledger had closed by that time.");
  }

  if (probes >= maxProbes && low <= high) {
    throw new NetworkCongestionError("timestamp_unresolved", "The timestamp search stopped at its probe limit before the close time was pinned down.");
  }

  if (match.sequence === bounds.high && match.sequence < input.latest.sequence) {
    const next = await input.readHeader(match.sequence + 1);
    const nextMs = next ? Date.parse(next.closedAt) : Number.NaN;

    if (next && Number.isFinite(nextMs) && nextMs <= targetMs) {
      throw new NetworkCongestionError(
        "timestamp_unresolved",
        "The close time sits outside the bounded search window, so no ledger was chosen.",
      );
    }
  }

  return { sequence: match.sequence, closedAt: match.closedAt, probes };
}
