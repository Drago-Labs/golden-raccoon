import { getStellarDataApiUrls, getStellarNetwork, type StellarNetworkId } from "@/lib/stellar/config";
import { redactProviderUrl } from "@/lib/stellar/failover";

export type LedgerParameters = { ledger: number; baseReserveStroops: bigint; source: string };
export type LedgerParameterReader = (ledger: number, network: StellarNetworkId) => Promise<LedgerParameters>;

export const readLedgerParameters: LedgerParameterReader = async (ledger, networkId) => {
  const network = getStellarNetwork(networkId);
  if (!network) throw new Error("Unsupported Stellar network");
  const errors: string[] = [];
  for (const endpoint of getStellarDataApiUrls(network)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/ledgers/${ledger}`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { sequence?: number | string; base_reserve_in_stroops?: number | string };
      const sequence = Number(payload.sequence);
      const baseReserve = String(payload.base_reserve_in_stroops ?? "");
      if (!Number.isSafeInteger(sequence) || !/^\d+$/.test(baseReserve) || BigInt(baseReserve) <= 0n) throw new Error("Malformed ledger parameters");
      return { ledger: sequence, baseReserveStroops: BigInt(baseReserve), source: redactProviderUrl(endpoint) };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "ledger read failed");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Ledger parameters unavailable: ${errors.join("; ")}`);
};
