export type RecordedEnsSnapshot = {
  recordedBlock: number;
  recordedTimestamp: number;
  normalizedName: string;
  registryResolver: string | null;
  forwardAddress: string | null;
  queriedAddress: string | null;
  reverseName: string | null;
  reverseForwardAddress: string | null;
  registrant: string | null;
  controller: string | null;
  nameWrapperWrapped: boolean;
  expiresAtTimestamp: number | null;
};

export interface EnsRegistryReader {
  readEnsSnapshot(input: {
    network: string;
    ensName?: string;
    targetAddress?: string;
  }): Promise<RecordedEnsSnapshot>;
}

export function createDefaultEnsReader(): EnsRegistryReader {
  return {
    async readEnsSnapshot(input) {
      return {
        recordedBlock: 0,
        recordedTimestamp: 0,
        normalizedName: input.ensName ?? "",
        registryResolver: null,
        forwardAddress: null,
        queriedAddress: input.targetAddress ?? null,
        reverseName: null,
        reverseForwardAddress: null,
        registrant: null,
        controller: null,
        nameWrapperWrapped: false,
        expiresAtTimestamp: null,
      };
    },
  };
}
