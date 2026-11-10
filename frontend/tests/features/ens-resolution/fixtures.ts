import type { EnsRegistryReader, RecordedEnsSnapshot } from "@/server/research/ens-resolution";

export const wallet = "0x9999999999999999999999999999999999999999";

export function recordedEnsReader(snapshot: RecordedEnsSnapshot): EnsRegistryReader {
  return {
    async readEnsSnapshot() {
      return snapshot;
    },
  };
}
