/**
 * Storage schema contract shared by all adapters.
 * Used by the health endpoint, deploy readiness checks, and migration runner.
 */
export const storageSchemaContract = {
  version: "1.0.0",
  migrationPath: "frontend/src/server/storage/migrations/20260728_chain_aware_identity.sql",
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
    "migration_ledger",
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

export const storageSChemaContract = storageSchemaContract;
