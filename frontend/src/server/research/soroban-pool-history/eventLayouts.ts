export const SUPPORTED_EVENT_TOPICS = ["swap", "deposit", "withdraw", "sync"] as const;

export type SupportedEventTopic = (typeof SUPPORTED_EVENT_TOPICS)[number];

export type RawPoolEvent = {
  id: string;
  ledger: number;
  topic: string;
  transactionHash: string;
  amountA?: string;
  amountB?: string;
  reserveA?: string;
  reserveB?: string;
  direction?: "a_to_b" | "b_to_a";
};

export type ParsedPoolEvent =
  | {
      id: string;
      ledger: number;
      kind: "swap";
      transactionHash: string;
      amountIn: bigint;
      amountOut: bigint;
      direction: "a_to_b" | "b_to_a";
    }
  | {
      id: string;
      ledger: number;
      kind: "deposit" | "withdraw";
      transactionHash: string;
      amountA: bigint;
      amountB: bigint;
    }
  | {
      id: string;
      ledger: number;
      kind: "sync";
      transactionHash: string;
      reserveA: bigint;
      reserveB: bigint;
    };

export type LayoutParseResult =
  | { status: "ok"; event: ParsedPoolEvent }
  | { status: "unsupported"; topic: string; eventId: string };

function requirePositive(value: string | undefined, field: string): bigint {
  if (value === undefined || value === "") {
    throw new Error(`Missing ${field}`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n) {
    throw new Error(`${field} must be non-negative`);
  }
  return parsed;
}

/** Parse a raw pool event into a known layout, or mark it unsupported. */
export function parsePoolEvent(raw: RawPoolEvent): LayoutParseResult {
  const topic = raw.topic.trim().toLowerCase();
  if (!SUPPORTED_EVENT_TOPICS.includes(topic as SupportedEventTopic)) {
    return { status: "unsupported", topic: raw.topic, eventId: raw.id };
  }

  try {
    if (topic === "swap") {
      const direction = raw.direction === "b_to_a" ? "b_to_a" : "a_to_b";
      return {
        status: "ok",
        event: {
          id: raw.id,
          ledger: raw.ledger,
          kind: "swap",
          transactionHash: raw.transactionHash,
          amountIn: requirePositive(raw.amountA, "amountA"),
          amountOut: requirePositive(raw.amountB, "amountB"),
          direction,
        },
      };
    }

    if (topic === "deposit" || topic === "withdraw") {
      return {
        status: "ok",
        event: {
          id: raw.id,
          ledger: raw.ledger,
          kind: topic,
          transactionHash: raw.transactionHash,
          amountA: requirePositive(raw.amountA, "amountA"),
          amountB: requirePositive(raw.amountB, "amountB"),
        },
      };
    }

    return {
      status: "ok",
      event: {
        id: raw.id,
        ledger: raw.ledger,
        kind: "sync",
        transactionHash: raw.transactionHash,
        reserveA: requirePositive(raw.reserveA, "reserveA"),
        reserveB: requirePositive(raw.reserveB, "reserveB"),
      },
    };
  } catch {
    return { status: "unsupported", topic: raw.topic, eventId: raw.id };
  }
}

/** Documented layout names for docs and unsupported notices. */
export function supportedLayoutNames(): readonly string[] {
  return SUPPORTED_EVENT_TOPICS;
}
