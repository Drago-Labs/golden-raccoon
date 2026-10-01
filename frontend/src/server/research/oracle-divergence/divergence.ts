import { latestRoundAtOrBefore } from "./matching";
import { formatScaledPrice, invertPrice, parseDecimalPrice, scaleRawAnswer, spreadBps } from "./priceMath";
import type { ComparisonState, FeedInput, FeedSummary, QuoteComparison, QuoteInput, RoundInput } from "./schema";

function compareOne(quote: QuoteInput, feed: FeedInput, rounds: RoundInput[], staleAfterSeconds: number): QuoteComparison {
  const base = { observedAt: quote.observedAt, sourceLabel: quote.sourceLabel, quotePrice: quote.price, feedId: feed.feedId };

  if (feed.paused) {
    return { ...base, state: "paused_feed", oracleRoundId: null, oracleUpdatedAt: null, oraclePrice: null, spreadBps: null, note: "The feed is marked paused; no round is treated as currently in force." };
  }

  const round = latestRoundAtOrBefore(rounds, quote.observedAt);
  if (!round) {
    return { ...base, state: "missing_feed", oracleRoundId: null, oracleUpdatedAt: null, oraclePrice: null, spreadBps: null, note: "No oracle round at or before this quote's timestamp." };
  }

  const ageSeconds = (Date.parse(quote.observedAt) - Date.parse(round.updatedAt)) / 1000;
  const staleThreshold = Math.max(feed.heartbeatSeconds, staleAfterSeconds);
  if (ageSeconds > staleThreshold) {
    return { ...base, state: "stale_feed", oracleRoundId: round.roundId, oracleUpdatedAt: round.updatedAt, oraclePrice: null, spreadBps: null, note: `The latest round is ${Math.round(ageSeconds)}s old, past the ${staleThreshold}s staleness bound.` };
  }

  let oracleScaled = scaleRawAnswer(round.rawAnswer, feed.decimals);
  if (feed.inverted) {
    const inverted = invertPrice(oracleScaled);
    if (inverted === null) {
      return { ...base, state: "stale_feed", oracleRoundId: round.roundId, oracleUpdatedAt: round.updatedAt, oraclePrice: null, spreadBps: null, note: "The feed's reported answer is zero and cannot be inverted." };
    }
    oracleScaled = inverted;
  }

  const quoteScaled = parseDecimalPrice(quote.price);
  const spread = spreadBps(quoteScaled, oracleScaled);

  return {
    ...base,
    state: "compared",
    oracleRoundId: round.roundId,
    oracleUpdatedAt: round.updatedAt,
    oraclePrice: formatScaledPrice(oracleScaled),
    spreadBps: spread,
    note: "",
  };
}

export function compareQuotesToFeed(quotes: QuoteInput[], feed: FeedInput, rounds: RoundInput[], staleAfterSeconds: number): QuoteComparison[] {
  return quotes.map((quote) => compareOne(quote, feed, rounds, staleAfterSeconds));
}

export function summarizeFeed(feed: FeedInput, comparisons: QuoteComparison[]): FeedSummary {
  const forFeed = comparisons.filter((c) => c.feedId === feed.feedId);
  const compared = forFeed.filter((c): c is QuoteComparison & { spreadBps: number } => c.state === "compared" && c.spreadBps !== null);
  const stale = forFeed.filter((c) => c.state === "stale_feed");
  const missing = forFeed.filter((c) => c.state === "missing_feed");

  const maxAbs = compared.length > 0 ? Math.max(...compared.map((c) => Math.abs(c.spreadBps))) : null;
  const average = compared.length > 0 ? Math.round(compared.reduce((sum, c) => sum + c.spreadBps, 0) / compared.length) : null;

  return {
    feedId: feed.feedId,
    providerLabel: feed.providerLabel,
    comparedCount: compared.length,
    staleCount: stale.length,
    missingCount: missing.length,
    maxAbsSpreadBps: maxAbs,
    averageSpreadBps: average,
  };
}

const classificationOrder: Record<ComparisonState, number> = { compared: 0, stale_feed: 1, missing_feed: 2, paused_feed: 3 };
export function sortComparisons(comparisons: QuoteComparison[]): QuoteComparison[] {
  return [...comparisons].sort((a, b) => classificationOrder[a.state] - classificationOrder[b.state] || Date.parse(a.observedAt) - Date.parse(b.observedAt));
}
