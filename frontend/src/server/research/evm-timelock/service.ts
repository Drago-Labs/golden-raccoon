import { isSupportedTimelockNetwork } from "./chainIdentity";
import { buildTimelockCoverage } from "./coverage";
import { EvmTimelockError } from "./errors";
import { createDefaultTimelockReader, type TimelockChainReader } from "./eventReader";
import { groupTimelockOperations } from "./operationGrouping";
import { summarizeTimelockRoles } from "./roleReader";
import { evmTimelockRequestSchema, type EvmTimelockResult } from "./schema";

export async function inspectEvmTimelock(
  rawInput: unknown,
  deps: { reader?: TimelockChainReader } = {},
): Promise<EvmTimelockResult> {
  const parsed = evmTimelockRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new EvmTimelockError("Invalid timelock request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedTimelockNetwork(input.network)) {
    throw new EvmTimelockError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const reader = deps.reader ?? createDefaultTimelockReader();
  let snapshot;
  try {
    snapshot = await reader.readTimelockSnapshot({
      network: input.network,
      timelockAddress: input.timelockAddress,
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Timelock RPC unavailable";
    return {
      network: input.network,
      timelockAddress: input.timelockAddress,
      recordedBlock: null,
      recordedTimestamp: null,
      minDelaySeconds: null,
      state: "unavailable",
      operations: [],
      roles: {
        proposers: [],
        executors: [],
        cancellers: [],
        admins: [],
        openExecutor: false,
        eoaAdmins: [],
      },
      coverage: buildTimelockCoverage({
        reachedProvider: false,
        recordedBlock: null,
        recordedTimestamp: null,
        eventsRead: 0,
        operations: [],
      }),
      warnings: [msg],
    };
  }

  const operations = groupTimelockOperations(snapshot.events, snapshot.recordedTimestamp);
  const roles = summarizeTimelockRoles(snapshot.roles);
  const coverage = buildTimelockCoverage({
    reachedProvider: true,
    recordedBlock: snapshot.recordedBlock,
    recordedTimestamp: snapshot.recordedTimestamp,
    eventsRead: snapshot.events.length,
    operations,
  });

  const warnings: string[] = [];
  if (roles.openExecutor) {
    warnings.push("Open executor role detected (0x0000...0000): any address can execute ready operations.");
  }
  if (roles.eoaAdmins.length > 0) {
    warnings.push(`Timelock admin role held by EOA(s): ${roles.eoaAdmins.join(", ")}`);
  }
  if (coverage.callsDecoded < coverage.callsTotal) {
    warnings.push("Some call payloads could not be decoded and are shown as raw calldata.");
  }

  const state = coverage.callsDecoded < coverage.callsTotal ? "partial" : "complete";

  return {
    network: input.network,
    timelockAddress: input.timelockAddress,
    recordedBlock: snapshot.recordedBlock,
    recordedTimestamp: snapshot.recordedTimestamp,
    minDelaySeconds: snapshot.minDelaySeconds,
    state,
    operations,
    roles,
    coverage,
    warnings,
  };
}
