/**
 * Turns attributed nodes into the grouped view the workbench renders.
 *
 * Shares are expressed against the *known-value* base — the sum of holdings
 * that carry a usable price — never against an assumed portfolio total. When
 * some holdings are unpriced, a share of the whole portfolio would be a number
 * nobody can justify, so it is reported as `null` instead.
 */
import type { AdaptedHolding } from "./holdingsAdapter";
import type { Attribution } from "./allocation";
import type { ResolvedRelationship } from "./relationshipInput";
import type { ExposureGroup, ExposureNode, RelationshipProvenance } from "./schema";

function earliest(values: Array<string | null>): string | null {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates[0] ?? null;
}

function latest(values: Array<string | null>): string | null {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates[dates.length - 1] ?? null;
}

export function buildGroups(
  attribution: Attribution,
  holdings: AdaptedHolding[],
  relationships: ResolvedRelationship[],
  knownValueMicroUsd: number,
): ExposureGroup[] {
  const holdingsById = new Map(holdings.map((holding) => [holding.id, holding]));
  const metaByTarget = new Map<string, { provenances: Set<RelationshipProvenance>; observedAt: Array<string | null> }>();

  for (const relationship of relationships) {
    const existing = metaByTarget.get(relationship.toId);
    if (existing) {
      existing.provenances.add(relationship.provenance);
      existing.observedAt.push(relationship.observedAt);
    } else {
      metaByTarget.set(relationship.toId, {
        provenances: new Set([relationship.provenance]),
        observedAt: [relationship.observedAt],
      });
    }
  }

  const groups = attribution.nodes
    .filter((node): node is ExposureNode & { kind: Exclude<ExposureNode["kind"], "holding"> } => node.kind !== "holding")
    .map((node) => {
      const meta = metaByTarget.get(node.id);
      const direct = node.contributingHoldings.reduce((sum, holdingId) => {
        const holding = holdingsById.get(holdingId);
        return sum + (holding?.valueMicroUsd ?? 0);
      }, 0);

      return {
        nodeId: node.id,
        kind: node.kind,
        label: node.label,
        network: node.network,
        // Every holding that reaches an issuer reaches it through a
        // relationship, so a group's direct and look-through values coincide
        // unless the node is itself held, which cannot happen for these kinds.
        directMicroUsd: 0,
        lookThroughMicroUsd: direct,
        totalMicroUsd: node.totalMicroUsd,
        sharePercentOfKnownValue:
          knownValueMicroUsd > 0 ? Number(((node.totalMicroUsd / knownValueMicroUsd) * 100).toFixed(4)) : null,
        holdingCount: node.contributingHoldings.length,
        contributingHoldings: node.contributingHoldings,
        provenances: meta ? [...meta.provenances].sort() : [],
        earliestObservedAt: meta ? earliest(meta.observedAt) : null,
        latestObservedAt: meta ? latest(meta.observedAt) : null,
      } satisfies ExposureGroup;
    });

  return groups.sort((left, right) => {
    const byValue = right.totalMicroUsd - left.totalMicroUsd;
    if (byValue !== 0) return byValue;
    return left.nodeId.localeCompare(right.nodeId);
  });
}

/**
 * Counts groups whose holding membership overlaps another group's. Overlap is
 * expected — an asset has both an issuer and a protocol — and the count exists
 * so the UI can say why the group totals sum to more than the portfolio.
 */
export function countOverlappingGroups(groups: ExposureGroup[]): number {
  let overlapping = 0;

  for (let index = 0; index < groups.length; index += 1) {
    const members = new Set(groups[index].contributingHoldings);

    const overlaps = groups.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      return other.contributingHoldings.some((holdingId) => members.has(holdingId));
    });

    if (overlaps) overlapping += 1;
  }

  return overlapping;
}
