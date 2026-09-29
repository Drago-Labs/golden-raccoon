/**
 * Compare a live/replayed payload against a versioned contract and baseline.
 */
import { contracts, IDENTITY_PATHS, UNIT_PATHS, type ProviderKind } from "./contracts";

export type DriftClass = "breaking" | "additive" | "unavailable" | "inconclusive" | "unchanged";

export type DriftFinding = {
  provider: ProviderKind;
  classification: DriftClass;
  path: string | null;
  detail: string;
};

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

function collectPaths(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      paths.push(...collectPaths(child, next));
    } else {
      paths.push(next);
    }
  }
  return paths;
}

export function comparePayload(options: {
  provider: ProviderKind;
  baseline: unknown;
  observed: unknown | null;
  available: boolean;
  flaky?: boolean;
}): DriftFinding[] {
  const { provider, baseline, observed, available, flaky } = options;

  if (!available || observed === null || observed === undefined) {
    return [
      {
        provider,
        classification: "unavailable",
        path: null,
        detail: "Probe failed or provider was unavailable; this is not a passing contract.",
      },
    ];
  }

  if (flaky) {
    return [
      {
        provider,
        classification: "inconclusive",
        path: null,
        detail: "Provider response was flaky within the probe window; drift is inconclusive.",
      },
    ];
  }

  const findings: DriftFinding[] = [];
  const parsed = contracts[provider].safeParse(observed);

  if (!parsed.success) {
    findings.push({
      provider,
      classification: "breaking",
      path: null,
      detail: `Observed payload failed ${provider} contract validation.`,
    });
  }

  for (const path of UNIT_PATHS[provider]) {
    const baseUnit = getPath(baseline, path);
    const obsUnit = getPath(observed, path);
    if (baseUnit !== undefined && obsUnit !== undefined && baseUnit !== obsUnit) {
      findings.push({
        provider,
        classification: "breaking",
        path,
        detail: `Unit shifted from ${String(baseUnit)} to ${String(obsUnit)}; structurally valid but semantically breaking.`,
      });
    }
  }

  for (const path of IDENTITY_PATHS[provider]) {
    const baseId = getPath(baseline, path);
    const obsId = getPath(observed, path);
    if (baseId !== undefined && obsId === undefined) {
      findings.push({
        provider,
        classification: "breaking",
        path,
        detail: `Identity field removed at ${path}.`,
      });
    }
  }

  const basePaths = new Set(collectPaths(baseline));
  const obsPaths = new Set(collectPaths(observed));

  for (const path of basePaths) {
    if (!obsPaths.has(path)) {
      // Already covered unit/identity specifically; remaining removals are breaking.
      if (!findings.some((finding) => finding.path === path)) {
        findings.push({
          provider,
          classification: "breaking",
          path,
          detail: `Expected field missing at ${path}.`,
        });
      }
    }
  }

  for (const path of obsPaths) {
    if (!basePaths.has(path)) {
      findings.push({
        provider,
        classification: "additive",
        path,
        detail: `New field present at ${path}; additive change.`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      provider,
      classification: "unchanged",
      path: null,
      detail: "Replay matched the versioned contract and baseline.",
    });
  }

  return findings;
}
