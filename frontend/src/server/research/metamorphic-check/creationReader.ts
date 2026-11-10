import type { CodeHashSample, CreationEvidence } from "./schema";

export type RecordedContractEvidence = {
  creation: CreationEvidence;
  runtimeBytecodeHex: string;
  codeHashSamples: CodeHashSample[];
};

export interface MetamorphicChainReader {
  readContractEvidence(input: {
    network: string;
    contractAddress: string;
    blockNumber?: number;
  }): Promise<RecordedContractEvidence>;
}

export function createDefaultMetamorphicReader(): MetamorphicChainReader {
  return {
    async readContractEvidence() {
      return {
        creation: {
          found: false,
          txHash: null,
          creationKind: "unknown",
          factoryAddress: null,
          salt: null,
          initCodeHex: null,
          deploymentBlock: null,
        },
        runtimeBytecodeHex: "0x",
        codeHashSamples: [],
      };
    },
  };
}
