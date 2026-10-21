import { collectKeys, organizationOf, type ValidatorNode } from "./organizationMap";
import { removalBreaks } from "./thresholds";
import type { OrganizationDependency } from "./schema";

function includesOrganization(node: ValidatorNode, organization: string, orgOf: (key: string) => string | null): boolean {
  if (!node.quorumSet) return false;
  return collectKeys(node.quorumSet).some((key) => orgOf(key) === organization);
}

/** Count top-level slices that name an organization, and how many of those thresholds fail without it. */
export function organizationDependencies(nodes: ValidatorNode[]): OrganizationDependency[] {
  const orgOf = organizationOf(nodes);
  const names = [...new Set(nodes.map((node) => node.organization).filter((name): name is string => Boolean(name)))].sort();
  return names.map((organization) => {
    const sets = nodes.filter((node) => node.quorumSet && includesOrganization(node, organization, orgOf));
    const broken = sets.filter((node) => node.quorumSet && removalBreaks(node.quorumSet, organization, orgOf));
    return { organization, topLevelCount: sets.length, removalBreaks: broken.length };
  });
}
