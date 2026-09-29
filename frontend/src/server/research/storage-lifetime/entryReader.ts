import type { xdr } from "@stellar/stellar-sdk";
import type { StellarNetworkId } from "@/lib/stellar/config";
import { StellarRpcDataLayer } from "@/server/stellar/dataLayer";

export type EntryEvidence = {
  latestLedger: number;
  entries: {
    key: xdr.LedgerKey;
    liveUntilLedgerSeq?: number;
    lastModifiedLedgerSeq?: number;
  }[];
  source: string;
};

export interface StorageEntryReader {
  read(keys: xdr.LedgerKey[], network: StellarNetworkId): Promise<EntryEvidence>;
}

export class RpcStorageEntryReader implements StorageEntryReader {
  async read(keys: xdr.LedgerKey[], network: StellarNetworkId): Promise<EntryEvidence> {
    const result = await new StellarRpcDataLayer(network).getLedgerEntries(keys, {
      requireAll: false,
    });

    return {
      latestLedger: result.value.latestLedger,
      entries: result.value.entries,
      source: result.meta.providerUrl,
    };
  }
}
