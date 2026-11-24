import type { ReserveSnapshot } from "./reserveReplay";

const PRICE_SCALE = 1_000_000_000n;

/** Implied constant-product price (reserveB / reserveA) scaled to 9 decimal places as a string. */
export function impliedPrice(reserveA: bigint, reserveB: bigint): string {
  if (reserveA <= 0n) return "0";
  const scaled = (reserveB * PRICE_SCALE) / reserveA;
  const whole = scaled / PRICE_SCALE;
  const frac = (scaled % PRICE_SCALE).toString().padStart(9, "0");
  return `${whole.toString()}.${frac}`;
}

/** Build a price point for every reserve snapshot. */
export function buildPriceSeries(snapshots: ReserveSnapshot[]): Array<{ ledger: number; price: string }> {
  return snapshots.map((snapshot) => ({
    ledger: snapshot.ledger,
    price: impliedPrice(snapshot.reserveA, snapshot.reserveB),
  }));
}

/** Absolute basis-point move between two scaled price strings. */
export function priceMoveBps(priceBefore: string, priceAfter: string): bigint {
  const before = parseScaled(priceBefore);
  const after = parseScaled(priceAfter);
  if (before <= 0n) return 0n;
  const delta = after > before ? after - before : before - after;
  return (delta * 10_000n) / before;
}

function parseScaled(price: string): bigint {
  const [whole, frac = ""] = price.split(".");
  const padded = (frac + "000000000").slice(0, 9);
  return BigInt(whole || "0") * PRICE_SCALE + BigInt(padded || "0");
}
