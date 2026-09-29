import { getStellarDataApiUrls, getStellarNetwork, type StellarNetworkId } from "@/lib/stellar/config";
import { redactProviderUrl } from "@/lib/stellar/failover";
import { normalizePathRecord, type RawPathRecord } from "./normalize";
import type { PathRoute } from "./schema";

export type PathEvidence = {
  ledger: number;
  closeTime: string;
  source: string;
  quoteAgeSeconds: number;
  routes: PathRoute[];
  noPath: boolean;
};

export interface PathSource {
  read(input: {
    network: StellarNetworkId;
    mode: "strict_send" | "strict_receive";
    sourceAsset: string;
    destinationAsset: string;
    amount: string;
  }): Promise<PathEvidence>;
}

function horizonAssetParams(assetKey: string, prefix: string): string {
  if (assetKey === "native") return `${prefix}_asset_type=native`;
  if (assetKey.startsWith("classic:")) {
    const [, code, issuer] = assetKey.split(":");
    return `${prefix}_asset_type=credit_alphanum4&${prefix}_asset_code=${encodeURIComponent(code!)}&${prefix}_asset_issuer=${encodeURIComponent(issuer!)}`;
  }
  throw new Error(`Unsupported asset key for Horizon paths: ${assetKey}`);
}

async function getJson<T>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Horizon HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export class HorizonPathSource implements PathSource {
  async read(input: {
    network: StellarNetworkId;
    mode: "strict_send" | "strict_receive";
    sourceAsset: string;
    destinationAsset: string;
    amount: string;
  }): Promise<PathEvidence> {
    const network = getStellarNetwork(input.network);
    if (!network) throw new Error("Unsupported Stellar network");

    let lastError: Error | null = null;
    for (const base of getStellarDataApiUrls(network)) {
      try {
        const latest = await getJson<{ _embedded: { records: { sequence: number; closed_at: string }[] } }>(
          base,
          "/ledgers?order=desc&limit=1",
        );
        const observed = latest._embedded.records[0];
        if (!observed) throw new Error("Latest ledger unavailable");
        const source = redactProviderUrl(base);
        const pathEndpoint =
          input.mode === "strict_send"
            ? `/paths/strict-send?${horizonAssetParams(input.sourceAsset, "source")}&${horizonAssetParams(input.destinationAsset, "destination")}&source_amount=${encodeURIComponent(input.amount)}`
            : `/paths/strict-receive?${horizonAssetParams(input.sourceAsset, "source")}&${horizonAssetParams(input.destinationAsset, "destination")}&destination_amount=${encodeURIComponent(input.amount)}`;
        const page = await getJson<{ _embedded: { records: RawPathRecord[] } }>(base, pathEndpoint);
        const records = page._embedded.records.slice(0, 5);
        const routes = records.map((record, index) => normalizePathRecord(record, input.mode, `route-${index + 1}`));
        return {
          ledger: Number(observed.sequence),
          closeTime: observed.closed_at,
          source,
          quoteAgeSeconds: 0,
          routes,
          noPath: routes.length === 0,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Horizon path read failed");
      }
    }
    throw lastError ?? new Error("Path-payment providers unavailable");
  }
}
