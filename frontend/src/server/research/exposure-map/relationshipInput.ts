/**
 * Validates and resolves declared relationships against the adapted holdings.
 *
 * A declaration that does not address a holding this wallet actually carries is
 * reported as unmatched rather than silently creating a floating node, and a
 * declaration with no provenance never reaches this module because the schema
 * rejects it first.
 */
import type { AdaptedHolding } from "./holdingsAdapter";
import type { ExposureRelationshipInput, RelationshipKind, RelationshipProvenance } from "./schema";

export type ResolvedRelationship = {
  fromId: string;
  toId: string;
  toLabel: string;
  toNetwork: string;
  kind: RelationshipKind;
  provenance: RelationshipProvenance;
  observedAt: string | null;
};

export type RelationshipResolution = {
  resolved: ResolvedRelationship[];
  /** Declarations that addressed nothing in this portfolio. */
  unmatched: Array<{ declaration: ExposureRelationshipInput; reason: string }>;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function targetNodeId(kind: RelationshipKind, network: string, label: string): string {
  return `${kind}:${normalize(network)}:${normalize(label)}`;
}

export function resolveRelationships(
  holdings: AdaptedHolding[],
  declarations: ExposureRelationshipInput[],
): RelationshipResolution {
  const byAlias = new Map<string, AdaptedHolding[]>();

  for (const holding of holdings) {
    for (const alias of holding.aliases) {
      const bucket = byAlias.get(alias);
      if (bucket) bucket.push(holding);
      else byAlias.set(alias, [holding]);
    }
  }

  // Node ids that a later declaration may itself start from. Holdings seed the
  // set; each resolved edge adds its target, which is how a nested chain such
  // as asset -> protocol -> parent protocol becomes expressible.
  const knownNodeIds = new Set<string>(holdings.map((holding) => holding.id));

  const resolved: ResolvedRelationship[] = [];
  const unmatched: RelationshipResolution["unmatched"] = [];

  let pending = [...declarations];

  // Fixed point: each pass resolves the declarations whose source is now known.
  // A declaration naming a node no pass ever creates stays unmatched, which is
  // reported rather than silently creating a floating node.
  for (;;) {
    const deferred: ExposureRelationshipInput[] = [];
    let progressed = false;

    for (const declaration of pending) {
      const key = normalize(declaration.fromAssetKey);
      const candidates = byAlias.get(key) ?? [];

      if (candidates.length > 1) {
        // A bare symbol can address more than one holding. Applying the edge to
        // every match would be an inference about common ownership, which this
        // feature refuses to make.
        unmatched.push({
          declaration,
          reason: `The declared asset key matches ${candidates.length} holdings. Address the holding by issuer or contract id so the relationship is unambiguous.`,
        });
        progressed = true;
        continue;
      }

      const holding = candidates[0];
      const fromId = holding ? holding.id : knownNodeIds.has(key) ? key : null;

      if (fromId === null) {
        deferred.push(declaration);
        continue;
      }

      const network = declaration.targetNetwork?.trim() || holding?.network || fromId.split(":")[1] || "";

      const edge: ResolvedRelationship = {
        fromId,
        toId: targetNodeId(declaration.kind, network, declaration.targetLabel),
        toLabel: declaration.targetLabel.trim(),
        toNetwork: normalize(network),
        kind: declaration.kind,
        provenance: declaration.provenance,
        observedAt: declaration.observedAt ?? null,
      };

      resolved.push(edge);
      knownNodeIds.add(edge.toId);
      progressed = true;
    }

    if (!progressed || deferred.length === 0) {
      for (const declaration of deferred) {
        unmatched.push({
          declaration,
          reason: "No holding or previously declared node in this portfolio matches the declared asset key.",
        });
      }
      break;
    }

    pending = deferred;
  }

  return { resolved, unmatched };
}
