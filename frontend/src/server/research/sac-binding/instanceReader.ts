import type { SacNetwork } from "./networkIdentity";
import type { ContractInstanceSnapshot } from "./schema";

export interface ContractInstanceProvider {
  readContractInstance(input: {
    contractId: string;
    network: SacNetwork;
  }): Promise<ContractInstanceSnapshot>;
}

export function createDefaultInstanceReader(): ContractInstanceProvider {
  return {
    async readContractInstance({ contractId }) {
      return {
        contractId,
        deployed: false,
        ledger: 0,
        executableKind: "missing",
        wasmHash: null,
        boundAssetCanonical: null,
        reportedMetadata: null,
      };
    },
  };
}
