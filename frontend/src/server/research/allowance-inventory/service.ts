import { getEvmNetwork } from "@/lib/evm/config";
import { readAllowance, classifyAllowance } from "./allowanceReader";
import { mergeCandidates } from "./candidates";
import { buildCoverage } from "./coverage";
import { knownBalanceExposure } from "./exposure";
import { discoverApprovalCandidates } from "./logReader";
import { createHttpAllowanceRpc, AllowanceProviderError, type AllowanceRpc } from "./rpc";
import type { AllowanceInventoryRequest, AllowanceInventoryResult, InventoryEntry } from "./schema";
import { groupBySpender } from "./spenderGrouping";
import { readTokenMetadata } from "./tokenMetadata";

export type InventoryDependencies = { rpc?: AllowanceRpc; now?: () => Date };

export async function buildAllowanceInventory(
  request: AllowanceInventoryRequest & { walletAddress: string },
  dependencies: InventoryDependencies = {},
): Promise<AllowanceInventoryResult> {
  const network = getEvmNetwork(request.network);
  if (!network) throw new Error("Unsupported EVM network");
  const rpc = dependencies.rpc ?? createHttpAllowanceRpc(network.rpcUrl);
  const limitations: string[] = [];
  const unsupported = new Set<string>();
  let snapshotBlock: bigint | null = null;
  let snapshotHash: string | null = null;
  let logPairs: { token: string; spender: string }[] = [];
  let logCoverageComplete = true;
  let reorgDetected = false;
  let malformedLogs = 0;

  try {
    snapshotBlock = await rpc.blockNumber();
    snapshotHash = await rpc.blockHash(snapshotBlock);
    if (!snapshotHash) limitations.push("Snapshot block hash unavailable; stability could not be proven");
    const requestedTo = request.toBlock ?? snapshotBlock;
    const toBlock = requestedTo > snapshotBlock ? snapshotBlock : requestedTo;
    if (request.fromBlock > toBlock) {
      logCoverageComplete = false;
      limitations.push("Discovery range begins after the available snapshot block");
    } else if (toBlock - request.fromBlock > 10_000n) {
      logCoverageComplete = false;
      limitations.push("Approval log range exceeds the 10,000 block safety limit");
    } else {
      try {
        const discovered = await discoverApprovalCandidates(rpc, request.walletAddress, request.fromBlock, toBlock);
        logPairs = discovered.pairs.slice(0, 200);
        malformedLogs = discovered.malformedLogs;
        if (discovered.pairs.length > 200) {
          logCoverageComplete = false;
          limitations.push("Candidate limit reached; narrow the block range");
        }
        if (malformedLogs) limitations.push(`${malformedLogs} malformed Approval log(s) skipped`);
      } catch (error) {
        logCoverageComplete = false;
        limitations.push(error instanceof AllowanceProviderError && error.kind === "rate_limit" ? "Approval log discovery rate-limited; retry later" : "Approval log discovery unavailable");
      }
    }
  } catch (error) {
    limitations.push(error instanceof AllowanceProviderError && error.kind === "rate_limit" ? "Snapshot request rate-limited; retry later" : "Snapshot block unavailable");
  }

  const candidates = mergeCandidates(logPairs, request.pairs);
  const entries: InventoryEntry[] = [];
  let skippedCalls = 0;
  if (snapshotBlock !== null) {
    for (const candidate of candidates) {
      try {
        const [allowance, metadata] = await Promise.all([
          readAllowance(rpc, candidate.token, request.walletAddress, candidate.spender, snapshotBlock),
          readTokenMetadata(rpc, candidate.token, request.walletAddress, snapshotBlock),
        ]);
        if (metadata.retryableFailures > 0) {
          skippedCalls += metadata.retryableFailures;
          if (!limitations.includes("Token metadata reads were rate-limited; retry later")) limitations.push("Token metadata reads were rate-limited; retry later");
        } else if (metadata.warnings.length) unsupported.add(candidate.token);
        entries.push({
          ...candidate,
          allowance: allowance.toString(),
          allowanceKind: classifyAllowance(allowance),
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          balance: metadata.balance?.toString() ?? null,
          knownBalanceExposure: knownBalanceExposure(allowance, metadata.balance)?.toString() ?? null,
          warnings: metadata.warnings,
        });
      } catch (error) {
        skippedCalls += 1;
        const retry = error instanceof AllowanceProviderError && error.retryable;
        entries.push({ ...candidate, allowance: null, allowanceKind: "unknown", symbol: null, decimals: null, balance: null, knownBalanceExposure: null, warnings: [retry ? "Allowance read rate-limited; retry later" : "Unsupported or malformed allowance response"] });
        unsupported.add(candidate.token);
      }
    }
    try {
      const confirmedHash = await rpc.blockHash(snapshotBlock);
      reorgDetected = Boolean(snapshotHash && confirmedHash && snapshotHash !== confirmedHash);
      if (reorgDetected) limitations.push("Snapshot block changed during the scan; retry for a stable view");
    } catch {
      limitations.push("Snapshot block could not be revalidated");
    }
  }

  if (snapshotBlock === null) {
    for (const candidate of candidates) {
      entries.push({ ...candidate, allowance: null, allowanceKind: "unknown", symbol: null, decimals: null, balance: null, knownBalanceExposure: null, warnings: ["Snapshot unavailable; current allowance was not read"] });
      skippedCalls += 1;
    }
  }

  const actualTo = snapshotBlock === null ? null : (request.toBlock && request.toBlock < snapshotBlock ? request.toBlock : snapshotBlock);
  const coverage = buildCoverage({
    fromBlock: request.fromBlock.toString(),
    toBlock: actualTo?.toString() ?? null,
    snapshotBlock: snapshotBlock?.toString() ?? null,
    candidateCount: candidates.length,
    successfulReads: entries.filter((entry) => entry.allowance !== null).length,
    skippedCalls,
    logCoverageComplete,
    reorgDetected,
    providerLimitations: limitations,
    unsupportedStandards: [...unsupported],
  });
  return {
    walletAddress: request.walletAddress.toLowerCase(),
    network: request.network,
    generatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    state: coverage.state,
    entries,
    spenderGroups: groupBySpender(entries),
    coverage,
  };
}
