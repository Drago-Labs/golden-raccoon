import type { EventDecoderNetwork } from "./networkIdentity";
import type { ContractEventSpecDef } from "./schema";

export interface ContractSpecProvider {
  readContractEventSpecs(input: {
    contractId: string;
    network: EventDecoderNetwork;
  }): Promise<ContractEventSpecDef[]>;
}

export function createDefaultSpecReader(): ContractSpecProvider {
  return {
    async readContractEventSpecs() {
      return [];
    },
  };
}
