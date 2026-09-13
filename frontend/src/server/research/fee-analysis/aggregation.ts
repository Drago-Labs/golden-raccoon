/**
 * Aggregation by network, asset, operation category and time window.
 *
 * Every grouping keeps assets apart. There is no code path that adds wei to
 * stroops, because there is no exchange rate in a sum — only in a conversion,
 * and a conversion needs evidence this module will not invent.
 *
 * Unknown charges are counted in `unknownCount` and contribute nothing to
 * `observedBaseUnits`. A reader can therefore see that a total covers 8 of 10
 * charges, rather than reading a total that silently covers 8 and looks like
 * it covers 10.
 */
import { sumBaseUnits, toFiat } from "./unitMath";
import type {
  AssetTotal,
  CategoryTotal,
  Conversion,
  FeeCharge,
  NetworkTotal,
  OperationCategory,
  TimelinePoint,
} from "./schema";

function assetKey(charge: FeeCharge): string {
  return charge.asset ? `${charge.asset.network}:${charge.asset.kind}` : "unknown";
}

function conversionFor(conversions: Conversion[], charge: FeeCharge): Conversion | null {
  if (!charge.asset) return null;

  return (
    conversions.find((entry) => entry.assetKind === charge.asset?.kind && entry.network === charge.asset.network) ?? null
  );
}

export function totalsByAsset(charges: FeeCharge[], conversions: Conversion[]): AssetTotal[] {
  const groups = new Map<string, FeeCharge[]>();

  for (const charge of charges) {
    const key = assetKey(charge);
    const bucket = groups.get(key);

    if (bucket) bucket.push(charge);
    else groups.set(key, [charge]);
  }

  const totals: AssetTotal[] = [];

  for (const group of groups.values()) {
    const asset = group.find((charge) => charge.asset !== null)?.asset;

    if (!asset) continue;

    const observed = group.filter((charge) => charge.evidence === "observed");
    const conversion = conversionFor(conversions, group[0]);
    const unknownCount = group.filter((charge) => charge.evidence === "unknown").length;
    const observedBaseUnits = sumBaseUnits(observed.map((charge) => charge.amountBaseUnits));

    totals.push({
      asset,
      observedBaseUnits,
      observedCount: observed.length,
      unknownCount,
      estimatedCount: group.filter((charge) => charge.evidence === "estimated").length,
      refundBaseUnits: sumBaseUnits(group.map((charge) => charge.refundBaseUnits)),
      // A fiat figure is produced only when there is a price *and* nothing
      // unknown in the group: a dollar total over a partial set reads as a
      // total over all of it.
      fiat:
        conversion && unknownCount === 0
          ? toFiat({
              baseUnits: observedBaseUnits,
              decimals: asset.decimals,
              unitPriceUsd: conversion.unitPriceUsd,
              pricedAt: conversion.pricedAt,
              appliedToCount: observed.length,
            })
          : null,
    });
  }

  return totals.sort((left, right) => left.asset.network.localeCompare(right.asset.network));
}

export function totalsByNetwork(charges: FeeCharge[], conversions: Conversion[]): NetworkTotal[] {
  const networks = new Map<string, FeeCharge[]>();

  for (const charge of charges) {
    const bucket = networks.get(charge.network);

    if (bucket) bucket.push(charge);
    else networks.set(charge.network, [charge]);
  }

  return [...networks.entries()]
    .map(([network, group]) => ({ network, chargeCount: group.length, byAsset: totalsByAsset(group, conversions) }))
    .sort((left, right) => left.network.localeCompare(right.network));
}

const CATEGORY_ORDER: OperationCategory[] = ["swap", "approval", "transfer", "trustline", "agent_log", "other"];

export function totalsByCategory(charges: FeeCharge[], conversions: Conversion[]): CategoryTotal[] {
  const categories = new Map<OperationCategory, FeeCharge[]>();

  for (const charge of charges) {
    const bucket = categories.get(charge.category);

    if (bucket) bucket.push(charge);
    else categories.set(charge.category, [charge]);
  }

  return [...categories.entries()]
    .map(([category, group]) => ({ category, chargeCount: group.length, byAsset: totalsByAsset(group, conversions) }))
    .sort((left, right) => CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category));
}

/** Truncates a timestamp to the start of its bucket, in UTC. */
export function bucketStart(iso: string, bucket: "day" | "week" | "month"): string {
  const date = new Date(iso);

  if (bucket === "month") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
  }

  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  if (bucket === "week") {
    // ISO weeks start on Monday; getUTCDay() calls Sunday 0.
    const offset = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - offset);
  }

  return day.toISOString();
}

export function buildTimeline(charges: FeeCharge[], conversions: Conversion[], bucket: "day" | "week" | "month"): TimelinePoint[] {
  const buckets = new Map<string, FeeCharge[]>();

  for (const charge of charges) {
    // A charge with no timestamp cannot be placed on a timeline. It stays in
    // the totals and is absent here, rather than being pinned to an arbitrary
    // bucket that would misdate it.
    if (!charge.occurredAt) continue;

    const key = bucketStart(charge.occurredAt, bucket);
    const existing = buckets.get(key);

    if (existing) existing.push(charge);
    else buckets.set(key, [charge]);
  }

  return [...buckets.entries()]
    .map(([startsAt, group]) => ({ startsAt, chargeCount: group.length, byAsset: totalsByAsset(group, conversions) }))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}
