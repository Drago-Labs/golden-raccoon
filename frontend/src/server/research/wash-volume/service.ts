export class WashVolumeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WashVolumeError";
    this.code = code;
  }
}

export type Trade = {
  tx: string;
  maker: string;
  taker: string;
  amount: number;
  funder: string;
  time: number;
  page: number;
};

const FILTERS: {
  id: string;
  label: string;
  falsePositives: string;
  match: (trade: Trade, trades: Trade[], windowMs: number) => boolean;
}[] = [
  {
    id: "same-address",
    label: "Same address",
    falsePositives: "A router that is both maker and taker in a legitimate aggregation can look like a self-trade.",
    match: (trade) => trade.maker.toLowerCase() === trade.taker.toLowerCase(),
  },
  {
    id: "same-funder",
    label: "Funded by the same source",
    falsePositives: "Two independent traders can share a funding source such as an exchange hot wallet.",
    match: (trade) => trade.maker.toLowerCase() !== trade.taker.toLowerCase() && trade.funder !== "" && trade.maker !== "",
  },
  {
    id: "back-and-forth",
    label: "Back and forth within the window",
    falsePositives: "Two desks hedging the same inventory can trade back and forth inside the window.",
    match: (trade, trades, windowMs) =>
      trades.some(
        (other) =>
          other.tx !== trade.tx &&
          other.maker.toLowerCase() === trade.taker.toLowerCase() &&
          other.taker.toLowerCase() === trade.maker.toLowerCase() &&
          Math.abs(other.time - trade.time) <= windowMs,
      ),
  },
  {
    id: "round-repeat",
    label: "Repeated round amounts",
    falsePositives: "A market maker quoting the same size can repeat a round amount without self-trading.",
    match: (trade, trades) =>
      trade.amount > 0 && trade.amount % 1000 === 0 && trades.filter((other) => other.amount === trade.amount).length >= 3,
  },
];

export type WashReport = {
  pair: string;
  coverage: "complete" | "partial";
  grossVolume: number;
  filters: {
    id: string;
    label: string;
    excludedVolume: number;
    remainingVolume: number;
    examples: Trade[];
    falsePositives: string;
  }[];
  heuristic: string;
};

export function analyzeWashVolume(input: {
  pair: string;
  trades: Trade[];
  windowMs?: number;
  truncated?: boolean;
}): WashReport {
  if (!input.pair.trim()) {
    throw new WashVolumeError("invalid_pair", "A pair id is required.");
  }
  const seen = new Set<string>();
  const trades = input.trades.filter((trade) => {
    if (seen.has(trade.tx)) return false;
    seen.add(trade.tx);
    return true;
  });
  const grossVolume = trades.reduce((sum, trade) => sum + trade.amount, 0);
  const windowMs = input.windowMs ?? 60_000;
  const filters = FILTERS.map((filter) => {
    const examples = trades.filter((trade) => filter.match(trade, trades, windowMs));
    const excludedVolume = examples.reduce((sum, trade) => sum + trade.amount, 0);
    return {
      id: filter.id,
      label: filter.label,
      excludedVolume,
      remainingVolume: grossVolume - excludedVolume,
      examples,
      falsePositives: filter.falsePositives,
    };
  });
  return {
    pair: input.pair,
    coverage: input.truncated ? "partial" : "complete",
    grossVolume,
    filters,
    heuristic: "Each filter is heuristic evidence. Filters are applied independently, so their order does not change the totals.",
  };
}
