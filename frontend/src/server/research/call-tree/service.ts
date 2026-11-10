import { buildCallTreeCoverage } from "./coverage";
import { normalizeDiagnosticEvents } from "./diagnosticEvents";
import { CallTreeError, type CallTreeState } from "./errors";
import { locateInnerFailure } from "./failureLocation";
import { createDefaultMetaReader, type InvocationMetaProvider } from "./metaReader";
import { isSupportedCallTreeNetwork } from "./networkIdentity";
import { callTreeRequestSchema, type CallTreeReport } from "./schema";
import { collectTransfersAndSummarize } from "./transferSummary";
import { buildCallTree } from "./treeBuilder";

export type CallTreeDeps = {
  metaProvider?: InvocationMetaProvider;
};

export async function traceCallTree(
  rawInput: unknown,
  deps: CallTreeDeps = {},
): Promise<CallTreeReport> {
  const parsed = callTreeRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new CallTreeError("Invalid call tree trace request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedCallTreeNetwork(input.network)) {
    throw new CallTreeError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const provider = deps.metaProvider ?? createDefaultMetaReader();
  let meta;
  try {
    meta = await provider.readInvocationMeta({
      txHash: input.txHash.toLowerCase(),
      network: input.network,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Soroban RPC provider unavailable";
    return {
      network: input.network,
      txHash: input.txHash.toLowerCase(),
      ledger: null,
      state: "unavailable",
      diagnosticsEnabled: false,
      roots: [],
      failure: null,
      transfers: [],
      netMovements: [],
      coverage: buildCallTreeCoverage({
        reachedProvider: false,
        diagnosticsEnabled: false,
        eventsProcessed: 0,
        eventsTruncated: false,
        message,
      }),
      warnings: [message],
    };
  }

  const normalized = normalizeDiagnosticEvents(meta);
  const roots = buildCallTree(meta, normalized.events);
  const { transfers, netMovements } = collectTransfersAndSummarize(roots);
  const failure = locateInnerFailure(roots);

  const warnings: string[] = [];
  if (!normalized.diagnosticsEnabled) {
    warnings.push(
      "Diagnostic events were not enabled on the RPC node; showing top-level invocation only.",
    );
  }
  if (normalized.truncated) {
    warnings.push("Diagnostic event stream exceeded limit and was truncated.");
  }

  const state: CallTreeState =
    !normalized.diagnosticsEnabled || normalized.truncated ? "partial" : "complete";

  return {
    network: input.network,
    txHash: input.txHash.toLowerCase(),
    ledger: meta.ledger,
    state,
    diagnosticsEnabled: normalized.diagnosticsEnabled,
    roots,
    failure,
    transfers,
    netMovements,
    coverage: buildCallTreeCoverage({
      reachedProvider: true,
      diagnosticsEnabled: normalized.diagnosticsEnabled,
      eventsProcessed: normalized.events.length,
      eventsTruncated: normalized.truncated,
      message: normalized.diagnosticsEnabled
        ? "Reconstructed nested cross-contract call graph from diagnostic events."
        : "Top-level-only call tree; diagnostic events unavailable for this transaction.",
    }),
    warnings,
  };
}
