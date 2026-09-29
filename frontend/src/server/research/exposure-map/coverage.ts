/**
 * Reports what the map could and could not account for.
 *
 * The rule this module enforces: an incomplete total is never presented as a
 * complete one. Unpriced holdings and holdings with no declared relationship
 * are counted and listed by name, so a reader can see the size of what is
 * missing rather than inferring it from a total that looks plausible.
 */
import type { AdaptedHolding } from "./holdingsAdapter";
import type { Attribution } from "./allocation";
import type { TraversalResult } from "./cycleGuard";
import type { ExposureCoverage, ExposureGroup, UnresolvedHolding } from "./schema";

export function findUnresolved(holdings: AdaptedHolding[], attribution: Attribution): UnresolvedHolding[] {
  const mapped = new Set<string>();

  for (const node of attribution.nodes) {
    if (node.kind === "holding") continue;
    for (const holdingId of node.contributingHoldings) mapped.add(holdingId);
  }

  return holdings
    .filter((holding) => !mapped.has(holding.id) || !holding.priced)
    .map((holding) => {
      const unmapped = !mapped.has(holding.id);
      const reason = unmapped && !holding.priced ? "both" : unmapped ? "no_declared_relationship" : "unpriced";

      const detail =
        reason === "both"
          ? "No relationship was declared for this holding and it carries no usable price, so it contributes to neither a group nor the known-value base."
          : reason === "no_declared_relationship"
            ? "No relationship was declared for this holding. Its value is in the known-value base but in no group."
            : "This holding carries no usable price, so it is excluded from the known-value base and contributes zero to any group it belongs to.";

      return {
        holdingId: holding.id,
        symbol: holding.symbol,
        reason: reason as UnresolvedHolding["reason"],
        valueMicroUsd: holding.valueMicroUsd,
        detail,
      };
    })
    .sort((left, right) => left.holdingId.localeCompare(right.holdingId));
}

export function buildCoverage(
  holdings: AdaptedHolding[],
  groups: ExposureGroup[],
  unresolved: UnresolvedHolding[],
  traversal: TraversalResult,
  droppedDuplicateCount: number,
  knownValue: number,
  overlappingGroupCount: number,
): ExposureCoverage {
  const priced = holdings.filter((holding) => holding.priced);
  const unmapped = unresolved.filter((entry) => entry.reason !== "unpriced");
  const unmappedValue = unmapped.reduce((sum, entry) => sum + (entry.valueMicroUsd ?? 0), 0);
  const droppedEdgeCount = traversal.droppedEdges.length + droppedDuplicateCount;

  if (holdings.length === 0) {
    return {
      state: "empty",
      holdingCount: 0,
      pricedHoldingCount: 0,
      unpricedHoldingCount: 0,
      knownValueMicroUsd: 0,
      unmappedHoldingCount: 0,
      unmappedValueMicroUsd: 0,
      droppedEdgeCount: 0,
      cycleCount: 0,
      overlappingGroupCount: 0,
      note: "The wallet carries no holdings on this network, so there is no exposure to map.",
    };
  }

  const complete =
    priced.length === holdings.length && unmapped.length === 0 && traversal.droppedEdges.length === 0;

  const reasons: string[] = [];
  if (priced.length !== holdings.length) {
    reasons.push(`${holdings.length - priced.length} holding${holdings.length - priced.length === 1 ? "" : "s"} carry no usable price`);
  }
  if (unmapped.length > 0) {
    reasons.push(`${unmapped.length} holding${unmapped.length === 1 ? " has" : "s have"} no declared relationship`);
  }
  if (traversal.cycleCount > 0) {
    reasons.push(`${traversal.cycleCount} edge${traversal.cycleCount === 1 ? "" : "s"} closed a cycle and ${traversal.cycleCount === 1 ? "was" : "were"} excluded`);
  }
  if (traversal.depthTruncationCount > 0) {
    reasons.push(`${traversal.depthTruncationCount} path${traversal.depthTruncationCount === 1 ? "" : "s"} hit the traversal depth bound`);
  }

  return {
    state: complete ? "complete" : "partial",
    holdingCount: holdings.length,
    pricedHoldingCount: priced.length,
    unpricedHoldingCount: holdings.length - priced.length,
    knownValueMicroUsd: knownValue,
    unmappedHoldingCount: unmapped.length,
    unmappedValueMicroUsd: unmappedValue,
    droppedEdgeCount,
    cycleCount: traversal.cycleCount,
    overlappingGroupCount,
    note: complete
      ? `Every holding is priced and mapped to at least one group across ${groups.length} group${groups.length === 1 ? "" : "s"}. Group totals overlap by design and do not sum to the portfolio.`
      : `Read these totals as partial: ${reasons.join("; ")}. Group totals overlap by design and do not sum to the portfolio.`,
  };
}
