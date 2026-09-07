/**
 * Storage schema contract shared by all adapters.
 * Used by the health endpoint and deploy readiness checks.
 */
export const storageSchemaContract = {
  tables: [
    "wallets",
    "agent_runs",
    "agent_results",
    "recommendations",
    "user_rules",
    "approvals",
    "transactions",
    "x402_payment_receipts",
    "x402_settlement_ledger",
    "token_identities",
    "source_snapshots",
  ],
  adapterApi: [
    "listAgentRunRecords",
    "getAgentRunRecord",
    "createAgentRunRecord",
    "listRecommendationRecords",
    "createRecommendationRecord",
    "listTransactionRecords",
    "createTransactionRecord",
    "listApprovalRecords",
    "createApprovalRecord",
    "listX402PaymentReceipts",
    "getX402PaymentReceiptByHeaderHash",
    "createX402PaymentReceipt",
    "getUserRuleRecord",
    "upsertUserRuleRecord",
  ],
  migration: "frontend/src/server/storage/schema.sql",
  sensitiveColumns: {
    wallets: ["address"],
  },
} as const;

// Back-compat alias for typo in upstream
export const storageSChemaContract = storageSchemaContract;
