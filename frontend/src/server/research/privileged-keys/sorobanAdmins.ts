import type { PrivilegeRecord } from "./schema";

/** Admin and upgrade authorities recorded for Soroban contracts. */
export function readSorobanAdmins(privileges: PrivilegeRecord[]): PrivilegeRecord[] {
  return privileges.filter((row) => row.chain === "soroban");
}
