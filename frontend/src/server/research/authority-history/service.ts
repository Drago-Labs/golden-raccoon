import { getEvmNetwork } from "@/lib/evm/config";
import { buildCoverage } from "./coverage";
import { decodeAuthorityLog, sortAuthorityEvents } from "./logDecoder";
import { reconstructAuthorityState } from "./reconstruction";
import {
  AUTHORITY_LIMITS,
  AUTHORITY_SCHEMA_VERSION,
  AuthorityHistoryError,
  authorityHistoryRequestSchema,
  type AuthorityEvent,
  type AuthorityHistoryReport,
} from "./schema";
import { AuthorityProviderError, createHttpAuthorityRpc, type AuthorityRpc } from "./rpc";
import { AUTHORITY_TOPICS } from "./topics";

export type AuthorityDependencies = {
  rpc?: AuthorityRpc;
  now?: () => Date;
};

/**
 * Read-only Ownable / AccessControl / ERC-1967 admin history for one contract
 * over an explicit block range.
 *
 * Reconstruction of current holders is published only when the indexed range
 * is complete and block hashes still match. A reorg or missing hash
 * invalidates reconstructed state. An empty event list never proves that no
 * authority exists.
 */
export async function buildAuthorityHistory(
  input: unknown,
  dependencies: AuthorityDependencies = {},
): Promise<AuthorityHistoryReport> {
  const parsed = authorityHistoryRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AuthorityHistoryError(
      "invalid_request",
      "The authority history request could not be read.",
      parsed.error.flatten(),
    );
  }

  const request = parsed.data;
  const walletAddress = request.walletAddress?.toLowerCase();
  if (!walletAddress) {
    throw new AuthorityHistoryError("invalid_request", "A wallet address is required.");
  }

  const network = getEvmNetwork(request.network);
  if (!network) {
    throw new AuthorityHistoryError("unsupported_network", "Unsupported EVM network.");
  }

  const rpc = dependencies.rpc ?? createHttpAuthorityRpc(network.rpcUrl);
  const providerLimitations: string[] = [];
  const unsupportedModels: string[] = [];
  let snapshotBlock: bigint | null = null;
  let snapshotHash: string | null = null;
  let toBlock: bigint | null = null;
  let logCoverageComplete = true;
  let reorgDetected = false;
  let missingBlockHashes = 0;
  let truncated = false;
  let events: AuthorityEvent[] = [];
  let malformedLogs = 0;

  try {
    snapshotBlock = await rpc.blockNumber();
    snapshotHash = await rpc.blockHash(snapshotBlock);
    if (!snapshotHash) {
      providerLimitations.push("Snapshot block hash unavailable; stability could not be proven");
    }

    const requestedTo = request.toBlock ?? snapshotBlock;
    toBlock = requestedTo > snapshotBlock ? snapshotBlock : requestedTo;

    if (request.fromBlock > toBlock) {
      logCoverageComplete = false;
      providerLimitations.push("Discovery range begins after the available snapshot block");
    } else if (toBlock - request.fromBlock > AUTHORITY_LIMITS.maxBlockSpan) {
      logCoverageComplete = false;
      providerLimitations.push(
        `Authority log range exceeds the ${AUTHORITY_LIMITS.maxBlockSpan} block safety limit`,
      );
    } else {
      try {
        const logs = await rpc.logs({
          address: request.contractAddress,
          fromBlock: request.fromBlock,
          toBlock,
          topics: [[...AUTHORITY_TOPICS]],
        });

        const decoded: AuthorityEvent[] = [];
        for (const log of logs) {
          const { event, malformed } = decodeAuthorityLog(log, request.network);
          if (malformed || !event) {
            malformedLogs += 1;
            continue;
          }
          decoded.push(event);
        }

        if (malformedLogs > 0) {
          logCoverageComplete = false;
          providerLimitations.push(`${malformedLogs} malformed authority log(s) skipped`);
        }

        const sorted = sortAuthorityEvents(decoded);
        if (sorted.length > AUTHORITY_LIMITS.maxEvents) {
          truncated = true;
          logCoverageComplete = false;
          providerLimitations.push(
            `Event limit of ${AUTHORITY_LIMITS.maxEvents} reached; narrow the block range`,
          );
          events = sorted.slice(0, AUTHORITY_LIMITS.maxEvents);
        } else {
          events = sorted;
        }

        // Verify each distinct event block hash still resolves to the same hash.
        const uniqueBlocks = new Map<string, string>();
        for (const event of events) {
          uniqueBlocks.set(event.blockNumber, event.blockHash);
        }
        for (const [blockNumber, expectedHash] of uniqueBlocks) {
          try {
            const currentHash = await rpc.blockHash(BigInt(blockNumber));
            if (!currentHash) {
              missingBlockHashes += 1;
              logCoverageComplete = false;
            } else if (currentHash.toLowerCase() !== expectedHash.toLowerCase()) {
              reorgDetected = true;
              logCoverageComplete = false;
            }
          } catch {
            missingBlockHashes += 1;
            logCoverageComplete = false;
          }
        }
      } catch (error) {
        logCoverageComplete = false;
        providerLimitations.push(
          error instanceof AuthorityProviderError && error.kind === "rate_limit"
            ? "Authority log discovery rate-limited; retry later"
            : "Authority log discovery unavailable",
        );
      }
    }
  } catch (error) {
    logCoverageComplete = false;
    providerLimitations.push(
      error instanceof AuthorityProviderError && error.kind === "rate_limit"
        ? "Snapshot request rate-limited; retry later"
        : "Snapshot block unavailable",
    );
  }

  if (snapshotBlock !== null && snapshotHash) {
    try {
      const confirmedHash = await rpc.blockHash(snapshotBlock);
      if (confirmedHash && confirmedHash.toLowerCase() !== snapshotHash.toLowerCase()) {
        reorgDetected = true;
        logCoverageComplete = false;
        providerLimitations.push("Snapshot block changed during the scan; retry for a stable view");
      }
    } catch {
      providerLimitations.push("Snapshot block could not be revalidated");
      logCoverageComplete = false;
    }
  }

  if (events.length === 0 && logCoverageComplete) {
    unsupportedModels.push(
      "No standard Ownable, AccessControl, or ERC-1967 AdminChanged events observed; custom access models remain unsupported",
    );
  }

  if (reorgDetected) {
    providerLimitations.push("Reorged or missing blocks invalidate reconstructed authority state");
  }
  if (missingBlockHashes > 0) {
    providerLimitations.push(
      `${missingBlockHashes} event block hash(es) could not be confirmed; reconstructed state is invalid`,
    );
  }

  const coverage = buildCoverage({
    fromBlock: request.fromBlock.toString(),
    toBlock: toBlock?.toString() ?? null,
    snapshotBlock: snapshotBlock?.toString() ?? null,
    eventCount: events.length,
    truncated,
    logCoverageComplete,
    reorgDetected,
    missingBlockHashes,
    unsupportedModels,
    providerLimitations,
  });

  const reconstructed = coverage.reconstructionValid
    ? reconstructAuthorityState(events)
    : { roleMatrix: [], roleAdmins: [], observedOwners: [] };

  return {
    schemaVersion: AUTHORITY_SCHEMA_VERSION,
    walletAddress,
    network: request.network,
    contractAddress: request.contractAddress.toLowerCase(),
    generatedAt: (dependencies.now?.() ?? new Date()).toISOString(),
    events,
    timeline: events,
    roleMatrix: reconstructed.roleMatrix,
    roleAdmins: reconstructed.roleAdmins,
    observedOwners: reconstructed.observedOwners,
    coverage,
    readOnly: true,
    authorityUnchanged: true,
  };
}

export { AuthorityHistoryError } from "./schema";
export type { AuthorityHistoryReport } from "./schema";
