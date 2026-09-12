import type { RiskSnapshotDocument } from "@/server/snapshots/schema";
import type {
  ComparisonFactor,
  FactorDeltaItem,
  FactorMatchResult,
  ImpactDeltaState,
} from "./schema";

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "general"
  );
}

/**
 * Derives a stable semantic key for a risk factor based on its functional
 * category and label, ensuring order-independent matching.
 *
 * @param factor - The comparison factor to compute a semantic key for.
 * @returns Normalized slug key formatted as category::label.
 */
export function deriveFactorSemanticKey(factor: ComparisonFactor): string {
  const categorySlug = slug(factor.category || "general");
  const labelSlug = slug(factor.label);
  return `${categorySlug}::${labelSlug}`;
}

/**
 * Parses a string reason entry from a risk snapshot document into a structured
 * comparison factor record with category, severity, and magnitude heuristics.
 *
 * @param reason - Raw text string from snapshot topReasons collection.
 * @returns Structured comparison factor.
 */
export function parseReasonToFactor(reason: string): ComparisonFactor {
  const trimmed = reason.trim();
  let category = "general";
  let label = trimmed;
  let detail = trimmed;

  const bracketMatch = /^\[([a-zA-Z0-9_\s-]+)\]\s*(.*)$/.exec(trimmed);
  if (bracketMatch) {
    category = bracketMatch[1].trim();
    const content = bracketMatch[2].trim();
    const subMatch = /^([^:\-]{2,40})[:\-]\s*(.*)$/.exec(content);
    if (subMatch) {
      label = subMatch[1].trim();
      detail = subMatch[2].trim();
    } else {
      label = content;
      detail = content;
    }
  } else {
    const colonMatch = /^([a-zA-Z0-9_\s-]{2,30}):\s*(.*)$/.exec(trimmed);
    if (colonMatch) {
      category = colonMatch[1].trim();
      label = colonMatch[2].trim();
      detail = colonMatch[2].trim();
    }
  }

  const lower = trimmed.toLowerCase();
  let severity = "info";
  let critical = false;

  if (
    lower.includes("critical") ||
    lower.includes("honeypot") ||
    lower.includes("blacklist") ||
    lower.includes("freeze authority") ||
    lower.includes("drain risk")
  ) {
    severity = "critical";
    critical = true;
  } else if (lower.includes("high") || lower.includes("danger") || lower.includes("severe")) {
    severity = "high";
  } else if (lower.includes("medium") || lower.includes("warning")) {
    severity = "medium";
  } else if (lower.includes("low")) {
    severity = "low";
  }

  let impact: number | null = null;
  const impactMatch = /(?:impact|score|magnitude):\s*(-?\d+(?:\.\d+)?)/i.exec(trimmed);
  if (impactMatch) {
    const parsedImpact = parseFloat(impactMatch[1]);
    if (Number.isFinite(parsedImpact)) {
      impact = parsedImpact;
    }
  }

  return {
    label,
    category,
    severity,
    detail,
    impact,
    critical,
  };
}

/**
 * Extracts and standardizes comparison factors from a risk snapshot document
 * and optional caller-provided factor records.
 *
 * @param document - Validated risk snapshot document.
 * @param explicitFactors - Optional array of caller-supplied factor objects.
 * @returns Normalized array of comparison factors.
 */
export function extractFactors(
  document: RiskSnapshotDocument,
  explicitFactors?: unknown[],
): ComparisonFactor[] {
  if (Array.isArray(explicitFactors) && explicitFactors.length > 0) {
    return explicitFactors.map((item) => {
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        const label = String(record.label ?? "Unlabelled factor");
        const category = String(record.category ?? "general");
        const severity = String(record.severity ?? "info");
        const detail = record.detail !== undefined ? String(record.detail) : undefined;
        const sourceLabel = record.sourceLabel !== undefined ? String(record.sourceLabel) : undefined;
        const rawImpact = typeof record.impact === "number" && Number.isFinite(record.impact) ? record.impact : null;
        const critical = Boolean(record.critical) || severity === "critical";
        return {
          label,
          category,
          severity,
          impact: rawImpact,
          detail,
          sourceLabel,
          critical,
        };
      }
      return parseReasonToFactor(String(item));
    });
  }

  return document.topReasons.map(parseReasonToFactor);
}

function resolveImpactDelta(
  baseImpact: number | null | undefined,
  targetImpact: number | null | undefined,
): { delta: number | null; state: ImpactDeltaState } {
  const baseKnown = typeof baseImpact === "number" && Number.isFinite(baseImpact);
  const targetKnown = typeof targetImpact === "number" && Number.isFinite(targetImpact);

  if (baseKnown && targetKnown) {
    const delta = (targetImpact as number) - (baseImpact as number);
    return {
      delta,
      state: delta === 0 ? "unchanged" : "numeric_delta",
    };
  }

  if (!baseKnown && targetKnown) {
    return {
      delta: null,
      state: "unknown_to_known",
    };
  }

  if (baseKnown && !targetKnown) {
    return {
      delta: null,
      state: "known_to_unknown",
    };
  }

  return {
    delta: null,
    state: "both_unknown",
  };
}

/**
 * Matches factors between baseline and target snapshots using stable semantic
 * keys rather than array index positions, classifying each factor into added,
 * removed, changed, unchanged, or ambiguous items.
 *
 * @param baseFactors - Baseline factors array.
 * @param targetFactors - Target factors array.
 * @returns Comprehensive factor match result with statistical summaries and item details.
 */
export function matchFactors(
  baseFactors: ComparisonFactor[],
  targetFactors: ComparisonFactor[],
): FactorMatchResult {
  const baseByKey = new Map<string, ComparisonFactor[]>();
  const targetByKey = new Map<string, ComparisonFactor[]>();

  for (const factor of baseFactors) {
    const key = deriveFactorSemanticKey(factor);
    const existing = baseByKey.get(key) ?? [];
    existing.push(factor);
    baseByKey.set(key, existing);
  }

  for (const factor of targetFactors) {
    const key = deriveFactorSemanticKey(factor);
    const existing = targetByKey.get(key) ?? [];
    existing.push(factor);
    targetByKey.set(key, existing);
  }

  const allKeys = Array.from(new Set([...baseByKey.keys(), ...targetByKey.keys()])).sort((a, b) =>
    a.localeCompare(b),
  );

  const items: FactorDeltaItem[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let ambiguousCount = 0;
  let criticalChangesCount = 0;

  for (const key of allKeys) {
    const baseGroup = baseByKey.get(key) ?? [];
    const targetGroup = targetByKey.get(key) ?? [];

    if (baseGroup.length > 1 || targetGroup.length > 1) {
      ambiguousCount += 1;
      const primaryBase = baseGroup[0];
      const primaryTarget = targetGroup[0];
      const representative = primaryTarget ?? primaryBase;
      const isCritical =
        baseGroup.some((item) => item.critical || item.severity === "critical") ||
        targetGroup.some((item) => item.critical || item.severity === "critical");

      items.push({
        key,
        label: representative.label,
        category: representative.category,
        status: "ambiguous",
        critical: isCritical,
        severity: {
          base: primaryBase?.severity,
          target: primaryTarget?.severity,
          changed: primaryBase?.severity !== primaryTarget?.severity,
        },
        impact: {
          base: primaryBase?.impact,
          target: primaryTarget?.impact,
          delta: null,
          state: "both_unknown",
        },
        baseDetail: baseGroup.map((item) => item.detail ?? item.label).join(" | "),
        targetDetail: targetGroup.map((item) => item.detail ?? item.label).join(" | "),
        ambiguityReason: `Semantic key "${key}" contains multiple conflicting entries (baseline: ${baseGroup.length}, target: ${targetGroup.length}).`,
      });
      continue;
    }

    if (baseGroup.length === 1 && targetGroup.length === 0) {
      const base = baseGroup[0];
      const isCritical = Boolean(base.critical) || base.severity === "critical";
      removedCount += 1;
      items.push({
        key,
        label: base.label,
        category: base.category,
        status: "removed",
        critical: isCritical,
        severity: {
          base: base.severity,
          changed: true,
        },
        impact: {
          base: base.impact,
          delta: null,
          state: base.impact != null ? "known_to_unknown" : "both_unknown",
        },
        baseDetail: base.detail,
        sourceLabels: {
          base: base.sourceLabel,
        },
      });
      continue;
    }

    if (baseGroup.length === 0 && targetGroup.length === 1) {
      const target = targetGroup[0];
      const isCritical = Boolean(target.critical) || target.severity === "critical";
      addedCount += 1;
      items.push({
        key,
        label: target.label,
        category: target.category,
        status: "added",
        critical: isCritical,
        severity: {
          target: target.severity,
          changed: true,
        },
        impact: {
          target: target.impact,
          delta: null,
          state: target.impact != null ? "unknown_to_known" : "both_unknown",
        },
        targetDetail: target.detail,
        sourceLabels: {
          target: target.sourceLabel,
        },
      });
      continue;
    }

    const base = baseGroup[0];
    const target = targetGroup[0];
    const isCritical =
      Boolean(base.critical) ||
      Boolean(target.critical) ||
      base.severity === "critical" ||
      target.severity === "critical";

    const severityChanged = base.severity !== target.severity;
    const detailChanged = (base.detail ?? base.label) !== (target.detail ?? target.label);
    const sourceLabelChanged = base.sourceLabel !== target.sourceLabel;
    const impactDeltaResult = resolveImpactDelta(base.impact, target.impact);
    const impactChanged =
      impactDeltaResult.state === "numeric_delta" && impactDeltaResult.delta !== 0
        ? true
        : impactDeltaResult.state === "unknown_to_known" || impactDeltaResult.state === "known_to_unknown";

    const isChanged = severityChanged || detailChanged || sourceLabelChanged || impactChanged;

    if (isChanged) {
      changedCount += 1;
      if (isCritical) {
        criticalChangesCount += 1;
      }
    } else {
      unchangedCount += 1;
    }

    items.push({
      key,
      label: target.label,
      category: target.category,
      status: isChanged ? "changed" : "unchanged",
      critical: isCritical,
      severity: {
        base: base.severity,
        target: target.severity,
        changed: severityChanged,
      },
      impact: {
        base: base.impact,
        target: target.impact,
        delta: impactDeltaResult.delta,
        state: impactDeltaResult.state,
      },
      baseDetail: base.detail,
      targetDetail: target.detail,
      sourceLabels: {
        base: base.sourceLabel,
        target: target.sourceLabel,
      },
    });
  }

  const hasMaterialDelta = addedCount > 0 || removedCount > 0 || changedCount > 0 || ambiguousCount > 0;

  return {
    summary: {
      addedCount,
      removedCount,
      changedCount,
      unchangedCount,
      ambiguousCount,
      criticalChangesCount,
      hasMaterialDelta,
    },
    items,
  };
}
