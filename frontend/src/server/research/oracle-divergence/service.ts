import { compareQuotesToFeed, sortComparisons, summarizeFeed } from "./divergence";
import { OracleError, oracleRequestSchema, ORACLE_SCHEMA_VERSION, type OracleReport, type PairAnalysis } from "./schema";

function withinWindow(iso: string, windowStart: string, windowEnd: string): boolean {
  const ms = Date.parse(iso);
  return ms >= Date.parse(windowStart) && ms <= Date.parse(windowEnd);
}

export function analyseOracleDivergence(rawInput: unknown): OracleReport {
  const parsedRequest = oracleRequestSchema.safeParse(rawInput);
  if (!parsedRequest.success) throw new OracleError("invalid_request", "The request did not match the expected shape.", parsedRequest.error.flatten());
  const input = parsedRequest.data;

  if (Date.parse(input.windowEnd) < Date.parse(input.windowStart)) {
    throw new OracleError("invalid_window", "windowEnd must not be before windowStart.");
  }

  const pairIds = new Set(input.pairs.map((p) => p.pairId));

  // A feed or a quote naming a pairId nobody declared is never guessed into
  // an existing pair: it is reported separately and excluded from every
  // comparison.
  const validFeeds = input.feeds.filter((feed) => pairIds.has(feed.pairId));
  const unmappedFeedIds = input.feeds.filter((feed) => !pairIds.has(feed.pairId)).map((feed) => feed.feedId);

  const quotesByPair = new Map<string, typeof input.quotes>();
  const unmappedQuotePairIds = new Set<string>();
  for (const quote of input.quotes) {
    if (!withinWindow(quote.observedAt, input.windowStart, input.windowEnd)) continue;
    if (!pairIds.has(quote.pairId)) {
      unmappedQuotePairIds.add(quote.pairId);
      continue;
    }
    const list = quotesByPair.get(quote.pairId) ?? [];
    list.push(quote);
    quotesByPair.set(quote.pairId, list);
  }

  const roundsByFeed = new Map<string, typeof input.rounds>();
  for (const round of input.rounds) {
    const list = roundsByFeed.get(round.feedId) ?? [];
    list.push(round);
    roundsByFeed.set(round.feedId, list);
  }

  const pairs: PairAnalysis[] = input.pairs.map((pair) => {
    const feedsForPair = validFeeds.filter((feed) => feed.pairId === pair.pairId);
    const quotes = quotesByPair.get(pair.pairId) ?? [];

    const comparisons = feedsForPair.flatMap((feed) => compareQuotesToFeed(quotes, feed, roundsByFeed.get(feed.feedId) ?? [], input.staleAfterSeconds));
    const feedSummaries = feedsForPair.map((feed) => summarizeFeed(feed, comparisons));

    return { pair, comparisons: sortComparisons(comparisons), feedSummaries };
  });

  return {
    schemaVersion: ORACLE_SCHEMA_VERSION,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    pairs,
    unmappedFeedIds,
    unmappedQuotePairIds: [...unmappedQuotePairIds],
  };
}
