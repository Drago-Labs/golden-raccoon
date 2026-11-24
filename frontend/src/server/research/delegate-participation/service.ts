import { delegateNotes, reportCoverage } from "./coverage";
import { rankDelegationChanges } from "./delegationChanges";
import { readDelegationEvents, type LogReader } from "./delegationEvents";
import { DelegateParticipationError } from "./errors";
import { resolveGovernance, resolveRange } from "./governanceInput";
import { DELEGATE_LIMITS } from "./limits";
import { largestDelegates, measureParticipation } from "./participation";
import { buildPowerSeries, currentPower, formatSeries, peakPower } from "./powerSeries";
import { proposalsInRange } from "./proposalWindows";
import { readGovernorActivity, type CodeReader } from "./voteReader";
import {
  delegateParticipationRequestSchema,
  type DelegateParticipationReport,
  type DelegateParticipationResult,
  type DelegateRow,
} from "./schema";

export type DelegateParticipationDeps = {
  readLogs: LogReader;
  readCode: CodeReader;
  readLatestBlock: () => Promise<number>;
};

function productionDeps(chain: string): DelegateParticipationDeps {
  const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
    const { resolveEvmRpcUrl } = await import("@/lib/evm/config");
    const response = await fetch(resolveEvmRpcUrl(chain), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(DELEGATE_LIMITS.timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) throw new DelegateParticipationError("provider_unavailable", `The ${chain} provider answered ${response.status}.`);
    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    if (payload.error) {
      throw new DelegateParticipationError("provider_unavailable", payload.error.message ?? `The ${chain} provider rejected ${method}.`);
    }
    if (payload.result === undefined || payload.result === null) {
      throw new DelegateParticipationError("provider_unavailable", `The ${chain} provider returned no result for ${method}.`);
    }
    return payload.result;
  };

  return {
    readLogs: (filter) =>
      rpc("eth_getLogs", [
        {
          address: filter.address,
          topics: filter.topics,
          fromBlock: `0x${filter.fromBlock.toString(16)}`,
          toBlock: `0x${filter.toBlock.toString(16)}`,
        },
      ]),
    readCode: (address) => rpc<string>("eth_getCode", [address, "latest"]),
    readLatestBlock: async () => Number(BigInt(await rpc<string>("eth_blockNumber", []))),
  };
}

/**
 * Reads a governance token's delegation events and its governor's proposals
 * and votes, rebuilds each delegate's voting power over time, and measures
 * participation only over the proposals each delegate could actually vote on.
 * Read-only: nothing here writes, signs or submits anything, and it ranks no
 * delegate against another.
 */
export async function readDelegateParticipation(
  input: unknown,
  deps?: DelegateParticipationDeps,
): Promise<DelegateParticipationResult> {
  const parsed = delegateParticipationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new DelegateParticipationError("invalid_request", "The delegate-participation request is invalid.", parsed.error.flatten());
  }
  const request = parsed.data;
  const governance = resolveGovernance(request);
  const readers = deps ?? productionDeps(governance.chain);

  const empty = (
    state: "unavailable" | "unsupported_governor",
    reason: string,
    range = { fromBlock: 0, toBlock: 0, coversHistory: false },
  ): DelegateParticipationResult => ({
    state,
    reason,
    report: {
      state: "unavailable",
      governance: {
        chain: governance.chain,
        chainId: governance.chainId,
        tokenAddress: governance.tokenAddress,
        governorAddress: governance.governorAddress,
      },
      range,
      delegates: [],
      proposals: [],
      largestChanges: [],
      coverage: [reason, "No voting power, participation rate or delegation change was inferred."],
      readOnly: true,
    },
  });

  let range;
  try {
    range = resolveRange(await readers.readLatestBlock(), request.fromBlock, request.toBlock);
  } catch (error) {
    if (error instanceof DelegateParticipationError && error.code !== "provider_unavailable") throw error;
    return empty("unavailable", `The chain head could not be read: ${error instanceof Error ? error.message : "unknown provider failure"}`);
  }

  let delegation;
  let governor;
  try {
    delegation = await readDelegationEvents(readers.readLogs, governance.tokenAddress, range.fromBlock, range.toBlock);
    governor = await readGovernorActivity(
      readers.readLogs,
      readers.readCode,
      governance.governorAddress,
      governance.explorerTxUrl,
      range.fromBlock,
      range.toBlock,
    );
  } catch (error) {
    if (error instanceof DelegateParticipationError && error.code === "unsupported_governor") {
      return empty("unsupported_governor", error.message, range);
    }
    return empty(
      "unavailable",
      `The governance evidence could not be read: ${error instanceof Error ? error.message : "unknown provider failure"}`,
      range,
    );
  }

  const seriesByDelegate = buildPowerSeries(delegation.checkpoints);
  const proposals = proposalsInRange(governor.proposals, range.fromBlock, range.toBlock);
  const addresses = governance.delegates.length
    ? governance.delegates
    : largestDelegates(seriesByDelegate, DELEGATE_LIMITS.maxDiscoveredDelegates);

  const delegates: DelegateRow[] = addresses.map((address) => {
    const series = seriesByDelegate.get(address);
    const participation = measureParticipation(address, series, proposals, governor.votes, range);
    const power = currentPower(series, range.toBlock, range.coversHistory);
    const peak = peakPower(series);
    const { state, notes } = delegateNotes({
      hasCheckpoints: Boolean(series?.checkpoints.length),
      truncatedSeries: Boolean(series?.truncated),
      undeterminedProposals: participation.undeterminedProposals.length,
      coversHistory: range.coversHistory,
      powerKnown: power !== null,
    });

    return {
      address,
      currentPowerUnits: power === null ? null : power.toString(),
      peakPowerUnits: peak === null ? null : peak.toString(),
      series: formatSeries(series, governance.explorerTxUrl),
      eligibleProposals: participation.eligibleProposals,
      votedProposals: participation.votedProposals,
      undeterminedProposals: participation.undeterminedProposals,
      participationBps: participation.participationBps,
      state,
      notes: [...notes, ...participation.notes],
    };
  });

  const report: DelegateParticipationReport = {
    state: !delegates.length
      ? "partial"
      : delegates.some((delegate) => delegate.state !== "complete") || delegation.truncated || governor.truncated
        ? "partial"
        : "complete",
    governance: {
      chain: governance.chain,
      chainId: governance.chainId,
      tokenAddress: governance.tokenAddress,
      governorAddress: governance.governorAddress,
    },
    range,
    delegates,
    proposals,
    largestChanges: rankDelegationChanges(
      delegation.checkpoints,
      delegation.moves,
      governance.explorerTxUrl,
      request.topChanges,
    ),
    coverage: reportCoverage({
      delegates,
      proposals,
      range,
      truncatedLogs: delegation.truncated || governor.truncated,
      votesRead: governor.votes.length,
    }),
    readOnly: true,
  };

  return { state: "ready", report };
}
