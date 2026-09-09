-- Rollback for 0001_baseline
drop view if exists retention_policy_summary cascade;
drop trigger if exists erasure_receipts_immutable on erasure_receipts;
drop function if exists enforce_erasure_receipt_immutability();

drop table if exists
  erasure_receipts,
  authz_audit_entries,
  discovery_alerts,
  watchlist_scan_runs,
  watchlist_entries,
  notification_preferences,
  alert_deliveries,
  alerts,
  alert_observations,
  alert_rules,
  auto_mode_authorization_events,
  auto_mode_policies,
  user_rules,
  recovery_requests,
  risk_snapshots,
  x402_settlement_ledger,
  x402_payment_receipts,
  transaction_observations,
  transaction_lifecycle_events,
  transactions,
  approvals,
  recommendations,
  source_snapshots,
  agent_results,
  agent_runs,
  token_identities,
  wallets
cascade;
