-- Validation for 0001_baseline
do $validate_baseline$
declare
  missing_count integer;
begin
  select count(*)
  into missing_count
  from (
    select unnest(array[
      'wallets',
      'token_identities',
      'agent_runs',
      'agent_results',
      'source_snapshots',
      'recommendations',
      'approvals',
      'transactions',
      'transaction_lifecycle_events',
      'transaction_observations',
      'x402_payment_receipts',
      'x402_settlement_ledger',
      'risk_snapshots',
      'recovery_requests',
      'user_rules',
      'auto_mode_policies',
      'auto_mode_authorization_events',
      'alert_rules',
      'alert_observations',
      'alerts',
      'alert_deliveries',
      'notification_preferences',
      'watchlist_entries',
      'watchlist_scan_runs',
      'discovery_alerts',
      'authz_audit_entries',
      'erasure_receipts'
    ]) as expected_table
  ) expected
  where not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = expected.expected_table
  );

  if missing_count > 0 then
    raise exception '0001_baseline validation failed: % tables missing', missing_count;
  end if;
end
$validate_baseline$;
