/**
 * Public entry point for execution preflight budgets.
 *
 * Pure. Never signs, sends, or mutates a prepared plan.
 */
import { buildFeeRows, buildSpendRows, collectBlockers, computeTotals } from "./budget";
import {
  PREFLIGHT_SCHEMA_VERSION,
  PreflightError,
  preflightRequestSchema,
  type PreflightCoverage,
  type PreflightReport,
} from "./schema";

function buildCoverage(blockerCodes: string[], rowCount: number): PreflightCoverage {
  if (rowCount === 0) {
    return {
      state: "empty",
      safeToPresentAsComplete: false,
      blockerCount: blockerCodes.length,
      note: "No budget rows could be built.",
    };
  }

  const unsafe = blockerCodes.some((code) =>
    ["stale_simulation", "network_mismatch", "plan_hash_mismatch", "insufficient_reserve", "max_slippage", "overflow"].includes(
      code,
    ),
  );
  const incomplete = blockerCodes.some((code) => ["unavailable_fee", "missing_mandatory"].includes(code));

  if (unsafe) {
    return {
      state: "unsafe",
      safeToPresentAsComplete: false,
      blockerCount: blockerCodes.length,
      note: "Blockers prevent a complete/safe budget claim.",
    };
  }

  if (incomplete || blockerCodes.length > 0) {
    return {
      state: "incomplete",
      safeToPresentAsComplete: false,
      blockerCount: blockerCodes.length,
      note: "Mandatory inputs are missing or uncertain; complete/safe is refused.",
    };
  }

  return {
    state: "complete",
    safeToPresentAsComplete: true,
    blockerCount: 0,
    note: "All mandatory inputs are present and no blockers fired.",
  };
}

export function analysePreflight(input: unknown): PreflightReport {
  const parsed = preflightRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new PreflightError("invalid_request", "The preflight request could not be read.", parsed.error.flatten());
  }

  const request = parsed.data;
  const observedAtMs = Date.parse(request.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new PreflightError("invalid_observed_at", "The observation time could not be read.");
  }

  const { rows: feeRows, blockers: feeBlockers } = buildFeeRows(request);
  const spendRows = buildSpendRows(request);
  const rows = [...spendRows, ...feeRows];
  const blockers = collectBlockers(request, feeBlockers);
  const totals = computeTotals(request, feeRows);

  return {
    schemaVersion: PREFLIGHT_SCHEMA_VERSION,
    observedAt: new Date(observedAtMs).toISOString(),
    chainFamily: request.preparedPlan.chainFamily,
    network: request.preparedPlan.network,
    planHash: request.preparedPlan.planHash,
    rows,
    blockers,
    totals,
    coverage: buildCoverage(
      blockers.map((blocker) => blocker.code),
      rows.length,
    ),
    neverSignsOrSends: true,
  };
}

export { PreflightError } from "./schema";
export type { PreflightReport } from "./schema";
