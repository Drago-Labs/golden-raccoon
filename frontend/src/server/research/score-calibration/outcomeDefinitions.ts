/**
 * Documented, observable outcome events this report can check a
 * snapshot's asset against.
 *
 * Each definition is a precise, falsifiable rule, not a vibe: "large
 * drawdown" means the asset's own price (against XLM, the one pair every
 * classic Stellar asset is most likely to have) fell by at least
 * `DRAWDOWN_RATIO_THRESHOLD` from its price at snapshot time to its
 * lowest price inside the horizon window. "Depeg" and "incident report"
 * are fully implemented detectors (see `outcomeDetection.ts`), but their
 * registries below are intentionally empty: neither a USD reference
 * price feed nor a durable incident log exists elsewhere in this app, so
 * fabricating entries for either would misrepresent what this tool can
 * actually observe. A caller selecting either outcome today gets every
 * snapshot excluded with `outcome_not_configured`, not a silent zero
 * rate — see `score-calibration-evidence.md`.
 */
import type { OutcomeType } from "./schema";

export const OUTCOME_DEFINITIONS: Record<OutcomeType, { label: string; description: string }> = {
  large_drawdown: {
    label: "Large drawdown",
    description: "The asset's price against XLM fell by at least 50% from its price at snapshot time to its lowest point within the horizon.",
  },
  depeg: {
    label: "Depeg",
    description: "The asset's price deviated from its documented peg target by more than the configured threshold within the horizon.",
  },
  incident_report: {
    label: "Incident report",
    description: "A documented incident affecting this asset was logged within the horizon.",
  },
};

export const DRAWDOWN_RATIO_THRESHOLD = 0.5;

export type PegReferenceEntry = {
  assetKey: string;
  /** The asset this one is pegged to, in the same `CODE:ISSUER` form, or `"native"` for XLM. */
  pegTargetAssetKey: string;
  /** Fraction of the peg ratio the price may deviate before counting as a depeg, e.g. 0.03 for 3%. */
  deviationThreshold: number;
};

/** Empty by default — see the module comment above. */
export const PEG_REGISTRY: PegReferenceEntry[] = [];

export type IncidentLogEntry = {
  assetKey: string;
  occurredAt: string;
  label: string;
};

/** Empty by default — see the module comment above. */
export const INCIDENT_LOG: IncidentLogEntry[] = [];

export type ParsedAssetKey = { kind: "classic"; code: string; issuer: string } | { kind: "contract"; contractId: string } | { kind: "unrecognized" };

export function parseAssetKey(assetKey: string): ParsedAssetKey {
  if (assetKey.startsWith("contract:")) {
    return { kind: "contract", contractId: assetKey.slice("contract:".length) };
  }
  const [code, issuer] = assetKey.split(":");
  if (code && issuer && /^[A-Z0-9]{1,12}$/.test(code) && /^G[A-Z2-7]{55}$/.test(issuer)) {
    return { kind: "classic", code, issuer };
  }
  return { kind: "unrecognized" };
}
