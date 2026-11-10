import type { RecordedTimelockSnapshot, TimelockChainReader } from "@/server/research/evm-timelock";

export const wallet = "0x9999999999999999999999999999999999999999";
export const timelockAddress = "0x1234567890123456789012345678901234567890";

export function recordedTimelockReader(snapshot: RecordedTimelockSnapshot): TimelockChainReader {
  return {
    async readTimelockSnapshot() {
      return snapshot;
    },
  };
}
