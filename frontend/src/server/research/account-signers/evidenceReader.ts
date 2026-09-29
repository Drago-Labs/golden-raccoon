import { getStellarDataApiUrls, getStellarNetwork, type StellarNetworkId } from "@/lib/stellar/config";
import { redactProviderUrl } from "@/lib/stellar/failover";
import type { SignerEntry, ThresholdSet } from "./schema";

export type SignerEvidence = {
  ledger: number;
  closeTime: string;
  source: string;
  thresholds: ThresholdSet;
  signers: SignerEntry[];
  accountMissing: boolean;
};

export interface SignerSource {
  read(input: { account: string; network: StellarNetworkId }): Promise<SignerEvidence>;
}

async function getJson<T>(base: string, path: string): Promise<T> {
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Horizon HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

type HorizonAccount = {
  id: string;
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
  signers: { key: string; weight: number; type?: string; sponsor?: string }[];
};

export class HorizonSignerSource implements SignerSource {
  async read(input: { account: string; network: StellarNetworkId }): Promise<SignerEvidence> {
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
        try {
          const account = await getJson<HorizonAccount>(base, `/accounts/${encodeURIComponent(input.account)}`);
          const master = account.signers.find((signer) => signer.key === account.id);
          const signers: SignerEntry[] = account.signers.map((signer) => ({
            key: signer.key,
            weight: signer.weight,
            kind:
              signer.type === "ed25519_public_key"
                ? "ed25519"
                : signer.type === "preauth_tx"
                  ? "preauth_tx"
                  : signer.type === "sha256_hash"
                    ? "hash_x"
                    : "unknown",
            sponsor: signer.sponsor ?? null,
          }));
          return {
            ledger: Number(observed.sequence),
            closeTime: observed.closed_at,
            source,
            thresholds: {
              low: account.thresholds.low_threshold,
              medium: account.thresholds.med_threshold,
              high: account.thresholds.high_threshold,
              masterWeight: master?.weight ?? 0,
            },
            signers,
            accountMissing: false,
          };
        } catch {
          return {
            ledger: Number(observed.sequence),
            closeTime: observed.closed_at,
            source,
            thresholds: { low: 0, medium: 0, high: 0, masterWeight: 0 },
            signers: [],
            accountMissing: true,
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Horizon read failed");
      }
    }
    throw lastError ?? new Error("Account signer providers unavailable");
  }
}
