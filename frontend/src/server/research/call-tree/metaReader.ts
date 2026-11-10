import type { CallTreeNetwork } from "./networkIdentity";
import type { RawInvocationMeta } from "./schema";

export interface InvocationMetaProvider {
  readInvocationMeta(input: { txHash: string; network: CallTreeNetwork }): Promise<RawInvocationMeta>;
}

export function createDefaultMetaReader(): InvocationMetaProvider {
  return {
    async readInvocationMeta({ txHash }) {
      return {
        txHash,
        ledger: 0,
        diagnosticsEnabled: false,
        topLevelCall: {
          contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM",
          functionName: "invoke",
          args: [],
        },
        events: [],
      };
    },
  };
}
