/**
 * Ownership, checked before any run content is read.
 *
 * The ordering is the point. A run is fetched *by wallet*, and the wallet on
 * the returned record is checked again before a single field of it reaches the
 * report. A caller who names a run belonging to someone else gets `not_found`
 * — not "forbidden", which would confirm the run exists.
 */
import { RunComparisonError, type RunReader } from "./schema";
import { normalizeRun, type NormalizedRun } from "./runReader";

export async function loadOwnedRun(reader: RunReader, input: { runId: string; walletAddress: string }): Promise<NormalizedRun> {
  const raw = await reader.getRun(input);

  if (!raw) {
    throw new RunComparisonError("not_found", "No saved run with that id belongs to this wallet.", 404, { runId: input.runId });
  }

  const run = normalizeRun(raw, input.runId);

  // Checked again on the record itself: a reader that ignored the wallet
  // filter must not be able to leak through this function.
  if (run.header.walletAddress.trim().toLowerCase() !== input.walletAddress.trim().toLowerCase()) {
    throw new RunComparisonError("not_found", "No saved run with that id belongs to this wallet.", 404, { runId: input.runId });
  }

  return run;
}

/**
 * Cross-context pairs are refused before any content is exposed.
 *
 * Two runs on different networks are two different questions; showing them
 * side by side as though the difference were a change would mislead.
 */
export function assertSameContext(left: NormalizedRun, right: NormalizedRun, requestedNetwork?: string): void {
  if (requestedNetwork) {
    const normalized = requestedNetwork.trim().toLowerCase();
    const matches = (value: string | null) => value === null || value.trim().toLowerCase() === normalized;

    if (!matches(left.header.network) || !matches(right.header.network)) {
      throw new RunComparisonError("cross_context", "Those runs are not both on the requested network.", 409, {
        left: left.header.network,
        right: right.header.network,
      });
    }
  }

  const leftNetwork = left.header.network?.trim().toLowerCase() ?? null;
  const rightNetwork = right.header.network?.trim().toLowerCase() ?? null;

  if (leftNetwork !== null && rightNetwork !== null && leftNetwork !== rightNetwork) {
    throw new RunComparisonError("cross_context", "Those runs are on different networks and cannot be compared.", 409, {
      left: leftNetwork,
      right: rightNetwork,
    });
  }
}
