import type { CoverageNotice, TimelockOperation } from "./schema";

export function buildTimelockCoverage(input: {
  reachedProvider: boolean;
  recordedBlock: number | null;
  recordedTimestamp: number | null;
  eventsRead: number;
  operations: TimelockOperation[];
}): CoverageNotice {
  const allCalls = input.operations.flatMap((op) => op.calls);
  return {
    reachedProvider: input.reachedProvider,
    recordedBlock: input.recordedBlock,
    recordedTimestamp: input.recordedTimestamp,
    eventsRead: input.eventsRead,
    operationsGrouped: input.operations.length,
    callsDecoded: allCalls.filter((c) => c.decoded).length,
    callsTotal: allCalls.length,
  };
}
