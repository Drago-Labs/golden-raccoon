/**
 * Ownership, applied before an id is looked up.
 *
 * The rule this module enforces: a record is addressable only through its
 * owner. Every repository query takes an `OwnerScope` and filters by it in the
 * same statement that matches the id — never as a check applied to a row that
 * was already fetched, because that ordering is one refactor away from leaking.
 */
import { notFound, type OwnerScope } from "./schema";

/**
 * Canonical form of an owner.
 *
 * Addresses are compared case-insensitively — an EVM address is the same
 * account whichever case it is written in — and the network is lowercased so
 * "Ethereum" and "ethereum" are one scope rather than two.
 */
export function canonicalOwner(owner: OwnerScope): OwnerScope {
  return {
    walletAddress: owner.walletAddress.trim().toLowerCase(),
    network: owner.network.trim().toLowerCase(),
  };
}

export function ownerKey(owner: OwnerScope): string {
  const canonical = canonicalOwner(owner);

  return `${canonical.walletAddress}|${canonical.network}`;
}

export function sameOwner(left: OwnerScope, right: OwnerScope): boolean {
  return ownerKey(left) === ownerKey(right);
}

/**
 * Asserts a fetched record belongs to the caller.
 *
 * This is a second line of defence, not the first: repositories filter by
 * owner in the query. It exists so a repository that forgets cannot leak.
 */
export function assertOwned<T extends { owner: OwnerScope }>(record: T | null | undefined, owner: OwnerScope, kind: string): T {
  if (!record || !sameOwner(record.owner, owner)) {
    throw notFound(kind);
  }

  return record;
}
