import type { ParsedPoolEvent } from "./eventLayouts";

export type ReserveSnapshot = {
  ledger: number;
  reserveA: bigint;
  reserveB: bigint;
  eventId: string | null;
};

/** Apply ordered pool events to opening reserves and emit a snapshot after each change. */
export function replayReserves(
  openingReserveA: bigint,
  openingReserveB: bigint,
  events: ParsedPoolEvent[],
  fromLedger: number,
): ReserveSnapshot[] {
  let reserveA = openingReserveA;
  let reserveB = openingReserveB;
  const series: ReserveSnapshot[] = [
    {
      ledger: fromLedger,
      reserveA,
      reserveB,
      eventId: null,
    },
  ];

  const ordered = [...events].sort((left, right) => left.ledger - right.ledger || left.id.localeCompare(right.id));

  for (const event of ordered) {
    if (event.kind === "deposit") {
      reserveA += event.amountA;
      reserveB += event.amountB;
    } else if (event.kind === "withdraw") {
      reserveA -= event.amountA;
      reserveB -= event.amountB;
    } else if (event.kind === "swap") {
      if (event.direction === "a_to_b") {
        reserveA += event.amountIn;
        reserveB -= event.amountOut;
      } else {
        reserveB += event.amountIn;
        reserveA -= event.amountOut;
      }
    } else {
      reserveA = event.reserveA;
      reserveB = event.reserveB;
    }

    if (reserveA < 0n) reserveA = 0n;
    if (reserveB < 0n) reserveB = 0n;

    series.push({
      ledger: event.ledger,
      reserveA,
      reserveB,
      eventId: event.id,
    });
  }

  return series;
}

/** Final reserves after replaying the full event list. */
export function finalReserves(series: ReserveSnapshot[]): { reserveA: bigint; reserveB: bigint } {
  const last = series[series.length - 1];
  return {
    reserveA: last?.reserveA ?? 0n,
    reserveB: last?.reserveB ?? 0n,
  };
}
