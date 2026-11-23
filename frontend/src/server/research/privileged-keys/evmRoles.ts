import type { PrivilegeRecord } from "./schema";

/** Owner, admin, and role rows recorded for EVM contracts. */
export function readEvmRoles(privileges: PrivilegeRecord[]): PrivilegeRecord[] {
  return privileges.filter((row) => row.chain === "evm");
}
