const TRANSACTION_EXPLANATIONS: Record<string, string> = {
  tx_success: "Every operation succeeded and the transaction was applied.",
  tx_failed: "An operation failed. Earlier successful results would have succeeded on their own. Later operations were not attempted.",
  tx_too_early: "The ledger closed before the transaction's minimum time. No operation ran.",
  tx_too_late: "The ledger closed after the transaction's maximum time. No operation ran.",
  tx_missing_operation: "The envelope contained no operations.",
  tx_bad_seq: "The source account sequence does not match this transaction. No operation ran.",
  tx_bad_auth: "A required signature is missing or invalid. No operation ran.",
  tx_insufficient_balance: "The fee source could not pay the fee. No operation ran.",
  tx_no_account: "The source account does not exist.",
  tx_insufficient_fee: "The offered fee is below the network minimum. No operation ran.",
  tx_bad_auth_extra: "The envelope carried unused signatures.",
  tx_internal_error: "The network reported an internal error while applying the transaction.",
  tx_not_supported: "The transaction uses a feature this network does not support.",
  tx_fee_bump_inner_success: "The fee-bump wrapper succeeded and the inner transaction succeeded. The two results are separate.",
  tx_fee_bump_inner_failed: "The fee-bump wrapper was charged and the inner transaction failed. The outer and inner results are separate.",
  tx_bad_sponsorship: "A sponsorship rule in the transaction was not met.",
  tx_bad_min_seq_age_or_gap: "The account sequence age or ledger gap precondition was not met. No operation ran.",
  tx_malformed: "The transaction was malformed before operations ran.",
  tx_soroban_invalid: "Soroban rejected the transaction before it could apply.",
  tx_frozen_key_accessed: "The transaction accessed a frozen Soroban storage key.",
};

const OPERATION_EXPLANATIONS: Record<string, string> = {
  op_success: "This operation succeeded.",
  op_underfunded: "The source did not have enough of the sent asset above its reserve and liabilities.",
  op_no_trust: "The destination has no trustline for this asset.",
  op_src_no_trust: "The source has no trustline for this asset.",
  op_no_destination: "The destination account does not exist.",
  op_not_authorized: "The destination trustline is not authorized.",
  op_line_full: "The payment would exceed the destination trustline limit.",
  op_no_issuer: "The asset issuer account does not exist.",
  op_malformed: "The operation was malformed.",
  op_bad_auth: "Authorization for this operation failed.",
  op_no_account: "The operation source account does not exist.",
  op_not_supported: "This operation is not supported.",
  op_too_many_subentries: "The account would exceed the subentry limit.",
  op_exceeded_work_limit: "The operation exceeded the network work limit.",
  op_too_many_sponsoring: "The account would sponsor too many entries.",
};

/** Codes that fail before any operation result is produced. */
const OPERATION_BEARING = new Set([
  "tx_success",
  "tx_failed",
  "tx_fee_bump_inner_success",
  "tx_fee_bump_inner_failed",
]);

export function explainTransactionCode(code: string): string {
  return TRANSACTION_EXPLANATIONS[code] ?? `Unknown result code: ${code}`;
}

export function explainOperationCode(code: string): string {
  return OPERATION_EXPLANATIONS[code] ?? `Unknown result code: ${code}`;
}

export function isTransactionLevelCode(code: string): boolean {
  return !OPERATION_BEARING.has(code);
}
