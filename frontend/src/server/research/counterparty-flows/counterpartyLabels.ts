/**
 * Labels counterparties from a known identity directory only.
 * Unknown accounts stay unlabelled — this module never invents a name.
 */

export type IdentityLabel = {
  label: string;
  evidence: string;
};

export type IdentityResolver = {
  resolve(account: string): IdentityLabel | null;
};

/** Empty production directory: only fixture or injected maps supply labels. */
const EMPTY_DIRECTORY: Record<string, IdentityLabel> = {};

export function createDirectoryResolver(
  directory: Record<string, IdentityLabel> = EMPTY_DIRECTORY,
): IdentityResolver {
  return {
    resolve(account: string) {
      const entry = directory[account];
      return entry ? { label: entry.label, evidence: entry.evidence } : null;
    },
  };
}

export const defaultIdentityResolver: IdentityResolver = createDirectoryResolver();

export function labelCounterparties(
  accounts: readonly string[],
  resolver: IdentityResolver = defaultIdentityResolver,
): Map<string, IdentityLabel | null> {
  const labels = new Map<string, IdentityLabel | null>();
  for (const account of accounts) {
    if (labels.has(account)) continue;
    labels.set(account, resolver.resolve(account));
  }
  return labels;
}
