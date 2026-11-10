import type { RoleHolder, TimelockEventLog } from "./schema";

export type RecordedTimelockSnapshot = {
  recordedBlock: number;
  recordedTimestamp: number;
  minDelaySeconds: number;
  events: TimelockEventLog[];
  roles: {
    proposers: RoleHolder[];
    executors: RoleHolder[];
    cancellers: RoleHolder[];
    admins: RoleHolder[];
  };
};

export interface TimelockChainReader {
  readTimelockSnapshot(input: {
    network: string;
    timelockAddress: string;
    fromBlock?: number;
    toBlock?: number;
  }): Promise<RecordedTimelockSnapshot>;
}

export function createDefaultTimelockReader(): TimelockChainReader {
  return {
    async readTimelockSnapshot() {
      return {
        recordedBlock: 0,
        recordedTimestamp: 0,
        minDelaySeconds: 0,
        events: [],
        roles: { proposers: [], executors: [], cancellers: [], admins: [] },
      };
    },
  };
}
