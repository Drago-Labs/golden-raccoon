import { getSupabaseClient } from "@/lib/supabase";
import type {
  TransactionLifecycleEvent,
  TransactionLifecycleEventName,
  TransactionLifecycleStatus,
  TransactionRecord,
} from "@/server/types";

function mapDbTransaction(row: Record<string, unknown>): TransactionRecord {
  return {
    hash: row.tx_hash as string,
    type: row.type as TransactionRecord["type"],
    asset: row.asset as string,
    valueUsd: (row.value_usd as number) ?? 0,
    status: row.lifecycle_status as TransactionLifecycleStatus,
    lifecycleStatus: row.lifecycle_status as TransactionLifecycleStatus,
    chainFamily: row.chain_family as "evm" | "stellar",
    createdAt: row.created_at as string,
    submittedAt: row.submitted_at as string | undefined,
    terminalAt: row.terminal_at as string | undefined,
    lastPolledAt: row.last_polled_at as string | undefined,
    network: row.network as string,
    walletAddress: row.wallet_address as string | undefined,
    sourceAccount: row.source_account as string | undefined,
    userApproved: row.user_approved as boolean | undefined,
    decisionId: row.decision_id as string | undefined,
    decisionAction: row.decision_action as TransactionRecord["decisionAction"],
    simulationStatus: row.simulation_status as TransactionRecord["simulationStatus"],
    policyStatus: row.policy_status ? (row.policy_status as any) : undefined,
    expectedEffects: row.expected_effects ? (row.expected_effects as TransactionRecord["expectedEffects"]) : undefined,
    idempotencyKey: row.idempotency_key as string | undefined,
    explorerUrl: row.explorer_url as string | undefined,
    failureReason: row.failure_reason as string | undefined,
  };
}

function mapDbEvent(row: Record<string, unknown>): TransactionLifecycleEvent {
  return {
    id: row.id as string,
    hash: row.transaction_hash as string,
    event: row.event as TransactionLifecycleEventName,
    detail: row.detail ? (row.detail as Record<string, unknown>) : undefined,
    occurredAt: row.occurred_at as string,
    provider: row.provider as string | undefined,
    providerUrl: row.provider_url as string | undefined,
  };
}

export async function listTransactionRecords(walletAddress?: string): Promise<TransactionRecord[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const db = supabase.from("transactions") as never;
  let query = (db as any).select("*").order("created_at", { ascending: false });
  if (walletAddress) {
    query = query.eq("wallet_address", walletAddress.toLowerCase());
  }
  const { data, error } = await query;
  if (error) throw new Error(`Supabase listTransactionRecords failed: ${error.message}`);
  return (data ?? []).map(mapDbTransaction);
}

export async function getTransactionRecord(hash: string): Promise<TransactionRecord | undefined> {
  const supabase = getSupabaseClient();
  if (!supabase) return undefined;

  const db = supabase.from("transactions") as never;
  const normalized = hash.trim().toLowerCase();
  const { data, error } = await (db as any).select("*").eq("tx_hash", normalized).maybeSingle();
  if (error) throw new Error(`Supabase getTransactionRecord failed: ${error.message}`);
  return data ? mapDbTransaction(data) : undefined;
}

export async function getTransactionRecordByIdempotencyKey(walletAddress: string, idempotencyKey: string): Promise<TransactionRecord | undefined> {
  const supabase = getSupabaseClient();
  if (!supabase) return undefined;

  const db = supabase.from("transactions") as never;
  const normalizedWallet = walletAddress.trim().toLowerCase();
  const { data, error } = await (db as any).select("*").eq("wallet_address", normalizedWallet).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (error) throw new Error(`Supabase getTransactionRecordByIdempotencyKey failed: ${error.message}`);
  return data ? mapDbTransaction(data) : undefined;
}

export async function createTransactionRecord(input: TransactionRecord): Promise<TransactionRecord> {
  const supabase = getSupabaseClient();
  if (!supabase) return input;

  const existing = await getTransactionRecord(input.hash);
  if (existing) return existing;

  const db = supabase.from("transactions") as never;
  const { error } = await (db as any).insert({
    tx_hash: input.hash,
    wallet_address: input.walletAddress?.toLowerCase(),
    decision_id: input.decisionId,
    decision_action: input.decisionAction,
    type: input.type,
    asset: input.asset,
    value_usd: input.valueUsd,
    status: input.status,
    lifecycle_status: input.lifecycleStatus,
    chain_family: input.chainFamily,
    source_account: input.sourceAccount,
    expected_effects: input.expectedEffects ?? [],
    idempotency_key: input.idempotencyKey,
    explorer_url: input.explorerUrl,
    failure_reason: input.failureReason,
    submitted_at: input.submittedAt,
    terminal_at: input.terminalAt,
    last_polled_at: input.lastPolledAt,
    network: input.network,
    user_approved: input.userApproved ?? false,
    simulation_status: input.simulationStatus,
    policy_status: input.policyStatus ?? {},
    created_at: input.createdAt,
  });
  if (error) throw new Error(`Supabase createTransactionRecord failed: ${error.message}`);
  return input;
}

export async function updateTransactionRecord(hash: string, updates: Partial<TransactionRecord>): Promise<TransactionRecord | undefined> {
  const supabase = getSupabaseClient();
  if (!supabase) return undefined;

  const normalized = hash.trim().toLowerCase();
  const dbUpdates: Record<string, unknown> = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.lifecycleStatus !== undefined) dbUpdates.lifecycle_status = updates.lifecycleStatus;
  if (updates.submittedAt !== undefined) dbUpdates.submitted_at = updates.submittedAt;
  if (updates.terminalAt !== undefined) dbUpdates.terminal_at = updates.terminalAt;
  if (updates.lastPolledAt !== undefined) dbUpdates.last_polled_at = updates.lastPolledAt;
  if (updates.failureReason !== undefined) dbUpdates.failure_reason = updates.failureReason;
  if (updates.explorerUrl !== undefined) dbUpdates.explorer_url = updates.explorerUrl;
  if (updates.status !== undefined) dbUpdates.status = updates.status;

  const db = supabase.from("transactions") as never;
  const { error } = await (db as any).update(dbUpdates).eq("tx_hash", normalized);
  if (error) throw new Error(`Supabase updateTransactionRecord failed: ${error.message}`);

  return getTransactionRecord(normalized);
}

export async function listTransactionLifecycleEvents(hash: string): Promise<TransactionLifecycleEvent[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const normalized = hash.trim().toLowerCase();
  const db = supabase.from("transaction_lifecycle_events") as never;
  const { data, error } = await (db as any).select("*").eq("transaction_hash", normalized).order("occurred_at", { ascending: false });
  if (error) throw new Error(`Supabase listTransactionLifecycleEvents failed: ${error.message}`);
  return (data ?? []).map(mapDbEvent);
}

export async function createTransactionLifecycleEvent(input: TransactionLifecycleEvent): Promise<TransactionLifecycleEvent> {
  const supabase = getSupabaseClient();
  if (!supabase) return input;

  const db = supabase.from("transaction_lifecycle_events") as never;
  const { error } = await (db as any).insert({
    transaction_hash: input.hash,
    event: input.event,
    detail: input.detail ?? {},
    provider: input.provider,
    provider_url: input.providerUrl,
    occurred_at: input.occurredAt,
  });
  if (error) throw new Error(`Supabase createTransactionLifecycleEvent failed: ${error.message}`);
  return input;
}
