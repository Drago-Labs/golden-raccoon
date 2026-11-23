import type { PrivilegeRecord } from "./schema";

export type MultisigDetail = { threshold: number; signerCount: number };

/** A multisig is a controller with a threshold above one. The threshold is copied, not inferred. */
export function multisigDetail(record: PrivilegeRecord): MultisigDetail | null {
  if (record.threshold === undefined || record.threshold <= 1) return null;
  return { threshold: record.threshold, signerCount: record.signers?.length ?? 0 };
}
