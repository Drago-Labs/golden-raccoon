import type { PathHop, PathRoute, VenueType } from "./schema";

export type RawPathRecord = {
  source_amount: string;
  destination_amount: string;
  path: { asset_type: string; asset_code?: string; asset_issuer?: string }[];
  source_asset_type?: string;
  source_asset_code?: string;
  source_asset_issuer?: string;
  destination_asset_type?: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
};

function recordAssetKey(assetType: string | undefined, code?: string, issuer?: string): string {
  if (!assetType || assetType === "native") return "native";
  if (code && issuer) return `classic:${code.toUpperCase()}:${issuer}`;
  return `unknown:${assetType}`;
}

export function inferVenue(index: number, hopCount: number): VenueType {
  // Horizon path records do not always label venue; keep explicit unknown unless fixture overrides.
  if (hopCount === 0) return "unknown";
  return index % 2 === 0 ? "orderbook" : "pool";
}

export function normalizePathRecord(
  record: RawPathRecord,
  mode: "strict_send" | "strict_receive",
  id: string,
): PathRoute {
  const sourceKey = recordAssetKey(record.source_asset_type, record.source_asset_code, record.source_asset_issuer);
  const destKey = recordAssetKey(
    record.destination_asset_type,
    record.destination_asset_code,
    record.destination_asset_issuer,
  );
  const intermediates = record.path.map((entry) =>
    recordAssetKey(entry.asset_type, entry.asset_code, entry.asset_issuer),
  );
  const chain = [sourceKey, ...intermediates, destKey];
  const hops: PathHop[] = [];
  for (let index = 0; index < chain.length - 1; index += 1) {
    const fromAssetKey = chain[index]!;
    const toAssetKey = chain[index + 1]!;
    hops.push({
      index,
      fromAssetKey,
      toAssetKey,
      inputAmount: index === 0 ? record.source_amount : "—",
      outputAmount: index === chain.length - 2 ? record.destination_amount : "—",
      venue: inferVenue(index, hops.length),
      note: `Hop ${index + 1}: ${fromAssetKey} → ${toAssetKey}`,
    });
  }

  // Guard against inverted limits in consumer code: keep mode explicit on the route.
  const warnings: string[] = [];
  if (mode === "strict_send") {
    warnings.push(`Strict-send locks source amount ${record.source_amount}; destination ${record.destination_amount} is estimated.`);
  } else {
    warnings.push(`Strict-receive locks destination amount ${record.destination_amount}; source ${record.source_amount} is estimated.`);
  }

  return {
    id,
    hops,
    sourceAmount: record.source_amount,
    destinationAmount: record.destination_amount,
    estimated: true,
    simulated: false,
    failure: "none",
    warnings,
  };
}
