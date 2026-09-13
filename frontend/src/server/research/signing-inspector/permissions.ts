/**
 * Permission summarisation.
 *
 * The ordering here is a safety decision rather than a cosmetic one: the
 * permission that grants the most sits first, so an unlimited approval buried
 * among four payments is the first thing a reader sees. Sorting is stable
 * within a rank, so the payload's own order survives where ranks tie.
 */
import type { Permission } from "./schema";

/** Higher rank means "hand over more control", not "more risk". */
function rank(permission: Permission): number {
  if (permission.isUnlimited) return 0;
  if (permission.kind === "permit_approval" || permission.kind === "token_approval") return 1;
  if (permission.kind === "allowance_increase" || permission.kind === "stellar_account_change") return 2;
  if (permission.kind === "transfer_from") return 3;
  if (permission.kind === "token_transfer" || permission.kind === "stellar_payment") return 4;

  return 5;
}

export function orderPermissions(permissions: Permission[]): Permission[] {
  return permissions
    .map((permission, index) => ({ permission, index }))
    .sort((left, right) => rank(left.permission) - rank(right.permission) || left.index - right.index)
    .map((entry) => entry.permission);
}

export type PermissionHighlights = {
  /** Approvals with no upper bound. */
  unlimitedCount: number;
  /** Permits whose deadline is already past the caller's evaluation time. */
  expiredCount: number;
  /** Permissions that hand spending power to another party. */
  delegatingCount: number;
};

export function summarisePermissions(permissions: Permission[]): PermissionHighlights {
  return {
    unlimitedCount: permissions.filter((permission) => permission.isUnlimited).length,
    expiredCount: permissions.filter((permission) => permission.deadline?.expired === true).length,
    delegatingCount: permissions.filter((permission) =>
      ["token_approval", "permit_approval", "allowance_increase", "stellar_account_change"].includes(permission.kind),
    ).length,
  };
}
