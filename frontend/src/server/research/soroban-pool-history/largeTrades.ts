import type { ParsedPoolEvent } from "./eventLayouts";
import { POOL_HISTORY_LIMITS } from "./limits";
import { impliedPrice, priceMoveBps } from "./priceSeries";
import type { ReserveSnapshot } from "./reserveReplay";
import type { LargeTrade } from "./schema";

type TradeCandidate = LargeTrade & { moveAbs: bigint };

/** Rank events by absolute implied-price move and attach transaction hashes. */
export function rankLargeTrades(
  events: ParsedPoolEvent[],
  snapshots: ReserveSnapshot[],
  limit = POOL_HISTORY_LIMITS.maxLargeTrades,
): LargeTrade[] {
  const byEventId = new Map<string, ReserveSnapshot>();
  for (const snapshot of snapshots) {
    if (snapshot.eventId) byEventId.set(snapshot.eventId, snapshot);
  }

  const candidates: TradeCandidate[] = [];
  let priorA = snapshots[0]?.reserveA ?? 0n;
  let priorB = snapshots[0]?.reserveB ?? 0n;

  for (const event of [...events].sort((a, b) => a.ledger - b.ledger || a.id.localeCompare(b.id))) {
    const after = byEventId.get(event.id);
    if (!after) continue;

    const priceBefore = impliedPrice(priorA, priorB);
    const priceAfter = impliedPrice(after.reserveA, after.reserveB);
    const moveAbs = priceMoveBps(priceBefore, priceAfter);

    let amountA = 0n;
    let amountB = 0n;
    if (event.kind === "swap") {
      amountA = event.direction === "a_to_b" ? event.amountIn : event.amountOut;
      amountB = event.direction === "a_to_b" ? event.amountOut : event.amountIn;
    } else if (event.kind === "deposit" || event.kind === "withdraw") {
      amountA = event.amountA;
      amountB = event.amountB;
    } else {
      amountA = event.reserveA;
      amountB = event.reserveB;
    }

    candidates.push({
      eventId: event.id,
      ledger: event.ledger,
      kind: event.kind,
      amountA: amountA.toString(),
      amountB: amountB.toString(),
      priceBefore,
      priceAfter,
      priceMoveBps: moveAbs.toString(),
      transactionHash: event.transactionHash,
      moveAbs,
    });

    priorA = after.reserveA;
    priorB = after.reserveB;
  }

  return candidates
    .sort((left, right) => {
      if (right.moveAbs !== left.moveAbs) return right.moveAbs > left.moveAbs ? 1 : -1;
      return left.ledger - right.ledger;
    })
    .slice(0, limit)
    .map(({ moveAbs: _move, ...trade }) => trade);
}
