import type { CostBasisEvent, CostBasisLot, CostBasisResult, RealizedPnl } from "@/server/portfolio/pnl/types";

const USD_SCALE = 100_000_000n;

function assetKey(value: string) {
  return value.trim().toLowerCase();
}

function decimalToScaled(value: string | undefined): bigint | null {
  if (value === undefined) return null;
  const raw = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const head = fraction.slice(0, 8).padEnd(8, "0");
  const rounded = fraction.length > 8 && Number(fraction[8] ?? "0") >= 5 ? 1n : 0n;
  return BigInt(whole) * USD_SCALE + BigInt(head || "0") + rounded;
}

function quantity(value: string) {
  return /^\d+$/.test(value.trim()) ? BigInt(value.trim()) : null;
}

function usdFor(quantityBaseUnits: bigint, unitPriceUsd: string | undefined) {
  const price = decimalToScaled(unitPriceUsd);
  return price === null ? null : quantityBaseUnits * price;
}

function formatUsd(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / USD_SCALE;
  const fraction = (absolute % USD_SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

type MutableLot = CostBasisLot & { quantity: bigint; cost: bigint };
type MutableRealized = { asset: string; proceeds: bigint; cost: bigint; pnl: bigint; quantity: bigint; unknownBasis: boolean };

function addLot(lots: Map<string, MutableLot[]>, event: CostBasisEvent, qty: bigint, cost: bigint, unknownBasis: boolean) {
  const key = assetKey(event.asset);
  const lot: MutableLot = {
    id: `${event.id}:lot:${(lots.get(key)?.length ?? 0) + 1}`,
    asset: key,
    acquiredAt: event.timestamp,
    quantityBaseUnits: qty.toString(),
    costBasisUsd: formatUsd(cost),
    source: event.source,
    unknownBasis,
    quantity: qty,
    cost,
  };
  lots.set(key, [...(lots.get(key) ?? []), lot]);
}

function consumeFifo(lots: Map<string, MutableLot[]>, asset: string, requested: bigint) {
  const key = assetKey(asset);
  const queue = lots.get(key) ?? [];
  let remaining = requested;
  let cost = 0n;
  let unknownBasis = false;
  const consumed: MutableLot[] = [];
  while (remaining > 0n && queue.length > 0) {
    const lot = queue[0]!;
    const taken = lot.quantity < remaining ? lot.quantity : remaining;
    const lotCost = lot.quantity === 0n ? 0n : (lot.cost * taken) / lot.quantity;
    cost += lotCost;
    unknownBasis ||= lot.unknownBasis;
    lot.quantity -= taken;
    lot.cost -= lotCost;
    remaining -= taken;
    consumed.push(lot);
    if (lot.quantity === 0n) queue.shift();
  }
  lots.set(key, queue);
  return { cost, remaining, unknownBasis, consumed };
}

function recordRealized(realized: Map<string, MutableRealized>, asset: string, qty: bigint, proceeds: bigint, cost: bigint, unknownBasis: boolean) {
  const key = assetKey(asset);
  const existing = realized.get(key);
  const current = {
    asset: key,
    proceeds: existing?.proceeds ?? 0n,
    cost: existing?.cost ?? 0n,
    pnl: existing?.pnl ?? 0n,
    quantity: existing?.quantity ?? 0n,
    unknownBasis: Boolean(existing?.unknownBasis),
  };
  current.proceeds += proceeds;
  current.cost += cost;
  current.pnl += proceeds - cost;
  current.quantity += qty;
  current.unknownBasis ||= unknownBasis;
  realized.set(key, current);
}

/** Deterministic FIFO lot accounting using integer quantities and fixed-point USD. */
export function calculateCostBasis(
  inputEvents: CostBasisEvent[],
  expectedBalances: Record<string, string> = {},
  marketPrices: Record<string, string> = {},
): CostBasisResult {
  const lots = new Map<string, MutableLot[]>();
  const realized = new Map<string, MutableRealized>();
  const missingPriceEventIds: string[] = [];
  const unknownBasisAssets = new Set<string>();
  const events = [...inputEvents].sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id));

  for (const event of events) {
    const qty = quantity(event.quantityBaseUnits);
    if (qty === null || qty <= 0n) { missingPriceEventIds.push(event.id); continue; }
    const key = assetKey(event.asset);
    const cost = usdFor(qty, event.unitPriceUsd);
    if (event.kind === "buy" || event.kind === "transfer") {
      addLot(lots, event, qty, cost ?? 0n, cost === null);
      if (cost === null) unknownBasisAssets.add(key);
    } else if (event.kind === "sell") {
      const consumed = consumeFifo(lots, key, qty);
      const proceeds = usdFor(qty, event.unitPriceUsd);
      if (proceeds === null) missingPriceEventIds.push(event.id);
      recordRealized(realized, key, qty - consumed.remaining, proceeds ?? 0n, consumed.cost, consumed.unknownBasis || proceeds === null || consumed.remaining > 0n);
      if (consumed.remaining > 0n || consumed.unknownBasis || proceeds === null) unknownBasisAssets.add(key);
    } else if (event.kind === "swap") {
      const sold = consumeFifo(lots, key, qty);
      const proceeds = usdFor(qty, event.unitPriceUsd ?? event.counterUnitPriceUsd);
      recordRealized(realized, key, qty - sold.remaining, proceeds ?? 0n, sold.cost, sold.unknownBasis || proceeds === null || sold.remaining > 0n);
      if (proceeds === null || sold.remaining > 0n || sold.unknownBasis) unknownBasisAssets.add(key);
      const receivedQty = quantity(event.counterQuantityBaseUnits ?? "");
      if (event.counterAsset && receivedQty && receivedQty > 0n) {
        const receivedCost = proceeds === null ? 0n : proceeds;
        addLot(lots, { ...event, asset: event.counterAsset }, receivedQty, receivedCost, proceeds === null);
        if (proceeds === null) unknownBasisAssets.add(assetKey(event.counterAsset));
      }
    } else if (event.kind === "fee") {
      const feeAsset = event.feeAsset ?? event.asset;
      const feeQty = quantity(event.feeQuantityBaseUnits ?? event.quantityBaseUnits) ?? 0n;
      const consumed = consumeFifo(lots, feeAsset, feeQty);
      if (consumed.remaining > 0n || consumed.unknownBasis) unknownBasisAssets.add(assetKey(feeAsset));
    }
  }

  const unrealized = [...lots.entries()].flatMap(([asset, queue]) => {
    const quantityTotal = queue.reduce((sum, lot) => sum + lot.quantity, 0n);
    const costTotal = queue.reduce((sum, lot) => sum + lot.cost, 0n);
    const marketPrice = decimalToScaled(marketPrices[asset]);
    const value = marketPrice === null ? undefined : quantityTotal * marketPrice;
    return [{ asset, quantityBaseUnits: quantityTotal.toString(), costBasisUsd: formatUsd(costTotal), marketValueUsd: value === undefined ? undefined : formatUsd(value), pnlUsd: value === undefined ? undefined : formatUsd(value - costTotal), unknownBasis: queue.some((lot) => lot.unknownBasis) }];
  });
  const reconciliation = Object.entries(expectedBalances).map(([asset, expected]) => {
    const calculated = (lots.get(assetKey(asset)) ?? []).reduce((sum, lot) => sum + lot.quantity, 0n);
    const expectedValue = quantity(expected) ?? 0n;
    return { asset: assetKey(asset), expectedBaseUnits: expectedValue.toString(), calculatedBaseUnits: calculated.toString(), deltaBaseUnits: (calculated - expectedValue).toString(), ok: calculated === expectedValue };
  });
  const flatLots = [...lots.values()].flat().map(({ quantity, cost, ...lot }) => ({ ...lot, quantityBaseUnits: quantity.toString(), costBasisUsd: formatUsd(cost) }));
  const realizedOutput: RealizedPnl[] = [...realized.values()].map((item) => ({ asset: item.asset, proceedsUsd: formatUsd(item.proceeds), costBasisUsd: formatUsd(item.cost), pnlUsd: formatUsd(item.pnl), quantityBaseUnits: item.quantity.toString(), unknownBasis: item.unknownBasis }));
  return { lots: flatLots, realized: realizedOutput, unrealized, missingPriceEventIds, unknownBasisAssets: [...unknownBasisAssets].sort(), status: missingPriceEventIds.length || unknownBasisAssets.size || reconciliation.some((item) => !item.ok) ? "incomplete" : "complete", reconciliation };
}

export { decimalToScaled, formatUsd };
