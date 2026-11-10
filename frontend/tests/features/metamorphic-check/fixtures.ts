import type { MetamorphicChainReader, RecordedContractEvidence } from "@/server/research/metamorphic-check";

export const wallet = "0x9999999999999999999999999999999999999999";
export const contractAddress = "0x1234567890123456789012345678901234567890";

export function recordedMetamorphicReader(evidence: RecordedContractEvidence): MetamorphicChainReader {
  return {
    async readContractEvidence() {
      return evidence;
    },
  };
}
