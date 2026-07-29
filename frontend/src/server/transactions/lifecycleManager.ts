import type { Hash } from "viem";
import { parseUnits, toFunctionSelector } from "viem";
import type { ChainFamily } from "@/lib/chainIdentity";
import { getChainFamily, isTransactionHashForChain } from "@/lib/chainIdentity";
import {
  getStellarChainAdapter,
  type StellarTerminalStatus,
  type StellarVerificationExpectation,
} from "@/server/transactions/adapters/stellar";
import {
  deriveEvmTransactionHash,
  getEvmChainAdapter,
  type EvmTerminalStatus,
  type EvmVerificationExpectation,
} from "@/server/transactions/adapters/evm";
import { attachExplorerUrl } from "@/server/transactions/explorer";
import {
  appendLifecycleEventByName,
  canonicalizeTransactionHash,
  createTransactionRecord,
  getTransactionRecord,
  getTransactionRecordByIdempotencyKey,
  isImmutableTerminal,
  listTransactionLifecycleEvents,
  removeTransactionRecordByHash,
  updateTransactionRecord,
} from "@/server/storage";
import type {
  PollTransactionResult,
  SubmitTransactionInput,
  SubmitTransactionResult,
  TransactionLifecycleEvent,
  TransactionLifecycleStatus,
  TransactionRecord,
  TransactionExpectedEffect,
  ChainFamily as TypesChainFamily,
} from "@/server/types";

export type CanonicalizedHash = Hash | string;

export const SUBMISSION_TTL_MS = 5 * 60_000;
export const POLL_INTERVAL_MS = 6_000;
export const POLL_DEADLINE_MS = 5 * 60_000;

export const PREPARED_LIFECYCLE: TransactionLifecycleStatus = "prepared";
export const SUBMISSION_FAILED_EVENT = "submission_failed" as const;

export type SubmissionOutcome = "ignored_duplicate" | "submitted" | "terminally_recorded";

export type SubmissionReport = {
  transaction: TransactionRecord;
  result: SubmitTransactionResult;
  outcome: SubmissionOutcome;
};

export type PrepareTransactionInput = {
  chainFamily: TypesChainFamily;
  network: string;
  walletAddress: string;
  sourceAccount?: string;
  decisionId?: string;
  decisionAction?: TransactionRecord["decisionAction"];
  asset: string;
  valueUsd?: number;
  expectedEffects?: TransactionExpectedEffect[];
  simulationStatus?: NonNullable<TransactionRecord["simulationStatus"]>;
  policyStatus?: NonNullable<TransactionRecord["policyStatus"]>;
  idempotencyKey: string;
};

export type PrepareTransactionResult = {
  transaction: TransactionRecord;
  idempotent: boolean;
  created: boolean;
};

export type ConfirmationExpectation = {
  walletAddress?: string;
  decisionWalletAddress?: string;
  sourceAccount?: string;
  expectedEffects?: TransactionExpectedEffect[];
};

type LifecycleStorageDependencies = {
  getByHash: typeof getTransactionRecord;
  getByIdempotencyKey: typeof getTransactionRecordByIdempotencyKey;
  create: typeof createTransactionRecord;
  update: typeof updateTransactionRecord;
  removeByHash: (hash: string) => boolean;
  appendEvent: typeof appendLifecycleEventByName;
  listEvents: typeof listTransactionLifecycleEvents;
};

const defaultStorage: LifecycleStorageDependencies = {
  getByHash: getTransactionRecord,
  getByIdempotencyKey: getTransactionRecordByIdempotencyKey,
  create: createTransactionRecord,
  update: updateTransactionRecord,
  removeByHash: removeTransactionRecordByHash,
  appendEvent: appendLifecycleEventByName,
  listEvents: listTransactionLifecycleEvents,
};

let storageOverride: LifecycleStorageDependencies | undefined;

export function setLifecycleStorage(deps: Partial<LifecycleStorageDependencies>) {
  storageOverride = { ...defaultStorage, ...deps };
}

function getStorage(): LifecycleStorageDependencies {
  return storageOverride ?? defaultStorage;
}

export class TransactionLifecycleError extends Error {
  public readonly code: string;
  public readonly detail?: Record<string, unknown>;
  constructor(code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "TransactionLifecycleError";
    this.code = code;
    this.detail = detail;
  }
}

export function assertHashMatchesFamily(hash: string, family: ChainFamily) {
  if (!isTransactionHashForChain(hash, family)) {
    throw new TransactionLifecycleError(
      "hash_chain_family_mismatch",
      `Transaction hash does not match chain family ${family}.`,
      { hash, family },
    );
  }
}

function normalizeHashForRecord(hash: string, family: ChainFamily): string {
  return family === "stellar" ? canonicalizeTransactionHash(hash, "stellar") : canonicalizeTransactionHash(hash, "evm");
}

export async function deriveSubmitHash(input: SubmitTransactionInput): Promise<string> {
  if (input.chainFamily === "evm") {
    return deriveEvmTransactionHash(input.signedPayload);
  }

  return getStellarChainAdapter({ network: input.network }).deriveHash(input.signedPayload);
}

function buildBaseRecord(
  input: Pick<SubmitTransactionInput, "asset" | "valueUsd" | "chainFamily" | "network" | "walletAddress" | "sourceAccount" | "decisionId" | "decisionAction" | "simulationStatus" | "policyStatus" | "expectedEffects" | "idempotencyKey">,
  hash: string,
): Omit<TransactionRecord, "createdAt" | "lifecycleStatus" | "status"> {
  return {
    hash,
    type: "swap",
    asset: input.asset,
    valueUsd: input.valueUsd ?? 0,
    chainFamily: input.chainFamily,
    network: input.network,
    walletAddress: input.walletAddress,
    sourceAccount: input.sourceAccount,
    decisionId: input.decisionId,
    decisionAction: input.decisionAction,
    userApproved: true,
    simulationStatus: input.simulationStatus,
    policyStatus: input.policyStatus,
    expectedEffects: input.expectedEffects,
    idempotencyKey: input.idempotencyKey,
  };
}

export function prepareTransaction(input: PrepareTransactionInput): PrepareTransactionResult {
  const storage = getStorage();
  const family = input.chainFamily;

  if (family !== getChainFamily(input.network)) {
    throw new TransactionLifecycleError(
      "network_chain_family_mismatch",
      `Network ${input.network} does not match chain family ${family}.`,
    );
  }

  const existing = storage.getByIdempotencyKey(input.walletAddress, input.idempotencyKey);
  if (existing) {
    return { transaction: existing, idempotent: true, created: false };
  }

  const record = storage.create({
    hash: canonicalizeTransactionHash(`pending:${input.walletAddress}:${input.idempotencyKey}`, family),
    type: "swap",
    asset: input.asset,
    valueUsd: input.valueUsd ?? 0,
    status: PREPARED_LIFECYCLE,
    lifecycleStatus: PREPARED_LIFECYCLE,
    chainFamily: family,
    network: input.network,
    walletAddress: input.walletAddress,
    sourceAccount: input.sourceAccount,
    decisionId: input.decisionId,
    decisionAction: input.decisionAction,
    userApproved: true,
    simulationStatus: input.simulationStatus,
    policyStatus: input.policyStatus,
    expectedEffects: input.expectedEffects,
    idempotencyKey: input.idempotencyKey,
    explorerUrl: undefined,
  });

  storage.appendEvent(record.hash, "prepared", {
    walletAddress: input.walletAddress,
    network: input.network,
    chainFamily: family,
    idempotencyKey: input.idempotencyKey,
  });

  return { transaction: record, idempotent: false, created: true };
}

export async function submitTransaction(input: SubmitTransactionInput): Promise<SubmissionReport> {
  if (input.userApproved !== true) {
    throw new TransactionLifecycleError("approval_required", "User wallet approval is mandatory before submission.");
  }

  const storage = getStorage();
  const family = input.chainFamily;

  if (family !== getChainFamily(input.network)) {
    throw new TransactionLifecycleError("network_chain_family_mismatch", `Network ${input.network} does not match chain family ${family}.`);
  }

  const existingByKey = input.idempotencyKey
    ? storage.getByIdempotencyKey(input.walletAddress, input.idempotencyKey)
    : undefined;
  if (existingByKey && existingByKey.hash !== canonicalizeTransactionHash(`pending:${input.walletAddress}:${input.idempotencyKey}`, family)) {
    return {
      transaction: existingByKey,
      outcome: "ignored_duplicate",
      result: {
        hash: existingByKey.hash,
        chainFamily: existingByKey.chainFamily,
        network: existingByKey.network,
        submittedAt: existingByKey.submittedAt ?? existingByKey.createdAt,
        status: existingByKey.lifecycleStatus,
        explorerUrl: existingByKey.explorerUrl,
        idempotent: true,
        reuseReason: "idempotency_key",
        lifecycle: storage.listEvents(existingByKey.hash),
      },
    };
  }

  const derivedHash = await deriveSubmitHash(input);
  const normalizedHash = normalizeHashForRecord(derivedHash, family);
  const existingByHash = storage.getByHash(derivedHash) ?? storage.getByHash(normalizedHash);

  if (existingByHash) {
    storage.appendEvent(normalizedHash, "duplicate_rejected", { reason: "duplicate_hash", walletAddress: input.walletAddress });
    return {
      transaction: existingByHash,
      outcome: "ignored_duplicate",
      result: {
        hash: existingByHash.hash,
        chainFamily: existingByHash.chainFamily,
        network: existingByHash.network,
        submittedAt: existingByHash.submittedAt ?? existingByHash.createdAt,
        status: existingByHash.lifecycleStatus,
        explorerUrl: existingByHash.explorerUrl,
        idempotent: true,
        reuseReason: "duplicate_hash",
        lifecycle: storage.listEvents(existingByHash.hash),
      },
    };
  }

  if (existingByKey) {
    // A prepared placeholder exists with the same idempotency key. Remove it so
    // the real record below can use the same key without violating the unique
    // (wallet_address, idempotency_key) index.
    storage.removeByHash(existingByKey.hash);
  }

  const base = buildBaseRecord(input, normalizedHash);
  const record = storage.create({ ...base, status: "prepared", lifecycleStatus: "prepared" });
  storage.appendEvent(normalizedHash, "prepared", { walletAddress: input.walletAddress, network: input.network, chainFamily: family });

  let submitResult;
  try {
    submitResult = await submitToChainAdapter(input);
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Unknown adapter failure during submission.";
    storage.appendEvent(normalizedHash, SUBMISSION_FAILED_EVENT, {
      reason: failureReason,
      network: input.network,
      chainFamily: family,
    }, { label: family === "stellar" ? "stellar_rpc" : "evm_rpc", url: getProviderUrl(family, input.network) });

    const failedRecord = storage.update(normalizedHash, {
      lifecycleStatus: "failed",
      status: "failed",
      terminalAt: new Date().toISOString(),
      failureReason,
    }) ?? record;

    return {
      transaction: failedRecord,
      outcome: "terminally_recorded",
      result: {
        hash: failedRecord.hash,
        chainFamily: failedRecord.chainFamily,
        network: failedRecord.network,
        submittedAt: failedRecord.submittedAt ?? failedRecord.createdAt,
        status: failedRecord.lifecycleStatus,
        explorerUrl: failedRecord.explorerUrl,
        idempotent: false,
        lifecycle: storage.listEvents(failedRecord.hash),
      },
    };
  }

  const submittedAt = submitResult.broadcastAcceptedAt ?? new Date().toISOString();

  const updated = storage.update(normalizedHash, {
    lifecycleStatus: "submitted",
    status: "submitted",
    submittedAt,
    explorerUrl: attachExplorerUrl({ hash: normalizedHash, network: input.network, chainFamily: family }),
  }) ?? record;

  storage.appendEvent(normalizedHash, "submitted", {
    network: input.network,
    providerUrl: submitResult.providerUrl,
    detail: submitResult.detail,
  }, { label: "chain_adapter", url: submitResult.providerUrl });

  return {
    transaction: updated,
    outcome: "submitted",
    result: {
      hash: updated.hash,
      chainFamily: updated.chainFamily,
      network: updated.network,
      submittedAt,
      status: updated.lifecycleStatus,
      explorerUrl: updated.explorerUrl,
      idempotent: false,
      lifecycle: storage.listEvents(updated.hash),
    },
  };
}

async function submitToChainAdapter(input: SubmitTransactionInput) {
  if (input.chainFamily === "evm") {
    const adapter = getEvmChainAdapter({ network: input.network });
    return adapter.submit(input.signedPayload, { expectedEffects: input.expectedEffects });
  }

  const adapter = getStellarChainAdapter({ network: input.network });
  return adapter.submit(input.signedPayload, {
    sourceAccount: input.sourceAccount,
    expectedEffects: input.expectedEffects,
  });
}

function getProviderUrl(family: ChainFamily, network: string): string {
  return family === "stellar" ? `stellar:${network}` : `evm:${network}`;
}

function deriveEvmMethodSelector(method: string | undefined): string | undefined {
  if (!method) return undefined;
  try {
    return toFunctionSelector(method).toLowerCase();
  } catch {
    return undefined;
  }
}

// Scale a human-readable decimal amount (e.g. "1.5") to base units (e.g. wei).
// Delegates the decimal parsing to viem's parseUnits so we do not reimplement
// fixed-point math inline — the helper only resolves which decimals to use.
// Caller-supplied `decimals` on the effect is authoritative; if absent we fall
// back to a coarse name-based heuristic that covers the well-known stablecoins
// and wraps to 18 otherwise. Production callers should always set `decimals`
// explicitly via a chain asset registry; the heuristic is intentional last resort.
function inferEvmTokenDecimals(contractOrSymbol: string | undefined): number {
  if (!contractOrSymbol) return 18;
  const normalized = contractOrSymbol.trim().toLowerCase();
  if (normalized === "usdc" || normalized === "usdc.e" || normalized.includes("/usdc")) return 6;
  if (normalized.includes("usdt")) return 6;
  if (normalized.includes("dai")) return 18;
  if (normalized.includes("wbtc")) return 8;
  return 18;
}

function resolveEvmDecimals(effect: { decimals?: number; contractAddress?: string; assetKey?: string }): number {
  if (typeof effect.decimals === "number" && Number.isInteger(effect.decimals) && effect.decimals >= 0 && effect.decimals <= 36) {
    return effect.decimals;
  }
  return inferEvmTokenDecimals(effect.contractAddress ?? effect.assetKey);
}

function scaleAmountToBaseUnits(
  amount: string | undefined,
  effect: { decimals?: number; contractAddress?: string; assetKey?: string },
): bigint | undefined {
  if (amount === undefined) return undefined;
  try {
    return parseUnits(amount, resolveEvmDecimals(effect));
  } catch {
    return undefined;
  }
}

function buildChainExpectation(
  family: ChainFamily,
  expectation: ConfirmationExpectation | undefined,
): EvmVerificationExpectation | StellarVerificationExpectation | undefined {
  if (!expectation) return undefined;
  const wallet = expectation.walletAddress ?? expectation.decisionWalletAddress;
  if (!wallet && !(expectation.expectedEffects && expectation.expectedEffects.length > 0)) {
    return undefined;
  }
   const effects = expectation.expectedEffects?.map((effect) => ({
     kind: effect.kind,
     fromAddress: effect.fromAddress,
     toAddress: effect.toAddress,
    contractAddress: effect.contractAddress,
    method: effect.method,
    amount: effect.amount,
    assetKey: effect.assetKey,
    decimals: effect.decimals,
  }));

  if (family === "evm") {
    const evmEffects = effects?.map((effect) => {
      const enriched: NonNullable<EvmVerificationExpectation["expectedEffects"]>[number] = {
        ...effect,
        requireObservedSource: true,
        methodSelector: deriveEvmMethodSelector(effect.method),
      };
      const baseUnits = scaleAmountToBaseUnits(effect.amount, effect);
      if (baseUnits !== undefined) {
        enriched.amountBaseUnits = baseUnits.toString();
      }
      return enriched;
    });
    const evmExpectation: EvmVerificationExpectation = {};
    if (wallet) evmExpectation.walletAddress = wallet;
    if (evmEffects && evmEffects.length > 0) evmExpectation.expectedEffects = evmEffects;
    return evmExpectation;
  }

  // Stellar verifier is symmetric with the EVM branch now: project amount
  // into amountBaseUnits via the same scaling helper so the adapter can do a
  // BigInt-safe comparison on integer-shaped base units. Asset identity
  // (assetKey) is forwarded unchanged. Stellar tokens use 7 decimal places
  // rather than the EVM default of 18. Spread then augment so the inferred
  // type carries amountBaseUnits unambiguously without re-declaring every
  // field by hand.
  const stellarEffects = effects?.map((effect) => {
    const baseUnits = scaleAmountToBaseUnits(effect.amount, { ...effect, decimals: effect.decimals ?? 7 });
    return {
      ...effect,
      ...(baseUnits !== undefined ? { amountBaseUnits: baseUnits.toString() } : {}),
    };
  });
  const stellarExpectation: StellarVerificationExpectation = {};
  if (wallet) stellarExpectation.walletAddress = wallet;
  if (expectation.sourceAccount) stellarExpectation.sourceAccount = expectation.sourceAccount;
  if (stellarEffects && stellarEffects.length > 0) stellarExpectation.expectedEffects = stellarEffects;
  return stellarExpectation;
}

export async function confirmTransaction(
  hash: string,
  expectation: ConfirmationExpectation = {},
): Promise<TransactionRecord> {
  const storage = getStorage();
  const normalizedHash = normalizeHashForRecord(hash, getChainFamilyForHash(hash));
  const record = storage.getByHash(normalizedHash);

  if (!record) {
    throw new TransactionLifecycleError(
      "transaction_not_found",
      `Transaction ${hash} has not been recorded by the lifecycle. Submit before confirming.`,
      { hash },
    );
  }

  if (isImmutableTerminal(record.lifecycleStatus)) {
    return record;
  }

  const family = record.chainFamily;
  const adapter = family === "stellar"
    ? getStellarChainAdapter({ network: record.network })
    : getEvmChainAdapter({ network: record.network });

  const finalExpectation: ConfirmationExpectation = {
    ...expectation,
    walletAddress: expectation.walletAddress ?? expectation.decisionWalletAddress ?? record.walletAddress,
    sourceAccount: expectation.sourceAccount ?? record.sourceAccount,
    expectedEffects: expectation.expectedEffects ?? record.expectedEffects,
  };

  const adapterExpectation = buildChainExpectation(family, finalExpectation);
  const pollResult = adapterExpectation
    ? await adapter.poll(record.hash as never, { expectation: adapterExpectation })
    : await adapter.poll(record.hash as never);

  const polledAt = new Date().toISOString();
  const nextStatus = mapToLifecycleStatus(pollResult.status);

  storage.appendEvent(record.hash, "polled", {
    network: record.network,
    providerUrl: pollResult.providerUrl,
    status: pollResult.status,
  }, { label: family === "stellar" ? "stellar_rpc" : "evm_rpc", url: pollResult.providerUrl });

  if (nextStatus !== "confirmed") {
    if (nextStatus === "pending" || nextStatus === "submitted") {
      const updated = storage.update(record.hash, { lifecycleStatus: nextStatus, status: nextStatus, lastPolledAt: polledAt }) ?? record;
      return updated;
    }
    const revertReason = "revertReason" in pollResult ? pollResult.revertReason ?? `On-chain verification reported ${nextStatus}.` : `On-chain verification reported ${nextStatus}.`;
    storage.appendEvent(record.hash, nextStatus, {
      network: record.network,
      providerUrl: pollResult.providerUrl,
      revertReason,
    }, { label: family === "stellar" ? "stellar_rpc" : "evm_rpc", url: pollResult.providerUrl });
    return storage.update(record.hash, {
      lifecycleStatus: nextStatus,
      status: nextStatus,
      lastPolledAt: polledAt,
      terminalAt: polledAt,
      failureReason: revertReason,
    }) ?? record;
  }

  storage.appendEvent(record.hash, "confirmed", {
    network: record.network,
    providerUrl: pollResult.providerUrl,
  }, { label: family === "stellar" ? "stellar_rpc" : "evm_rpc", url: pollResult.providerUrl });

  return storage.update(record.hash, {
    lifecycleStatus: "confirmed",
    status: "confirmed",
    lastPolledAt: polledAt,
    terminalAt: polledAt,
  }) ?? record;
}

function getChainFamilyForHash(hash: string): ChainFamily {
  return isTransactionHashForChain(hash, "stellar") ? "stellar" : "evm";
}

export async function recordUserRejection(
  hash: string,
  input: { walletAddress?: string; reason?: string; source?: "wallet" | "frontend" } = {},
): Promise<TransactionRecord> {
  const storage = getStorage();
  const family = isTransactionHashForChain(hash, "stellar") ? "stellar" : "evm";
  const normalizedHash = canonicalizeTransactionHash(hash, family);
  const record = storage.getByHash(normalizedHash);

  if (!record) {
    throw new TransactionLifecycleError(
      "transaction_not_found",
      `Transaction ${hash} not found in lifecycle store; cannot reject.`,
      { hash },
    );
  }

  if (input.walletAddress && record.walletAddress && input.walletAddress.toLowerCase() !== record.walletAddress.toLowerCase()) {
    throw new TransactionLifecycleError(
      "wallet_mismatch",
      `Connected wallet ${input.walletAddress} cannot reject transaction owned by ${record.walletAddress}.`,
      { hash, recordedWallet: record.walletAddress, callerWallet: input.walletAddress },
    );
  }

  if (isImmutableTerminal(record.lifecycleStatus)) {
    return record;
  }

  const rejectedAt = new Date().toISOString();
  storage.appendEvent(normalizedHash, "user_rejected", {
    reason: input.reason,
    source: input.source ?? "wallet",
    walletAddress: input.walletAddress ?? record.walletAddress,
  });

  return storage.update(normalizedHash, {
    lifecycleStatus: "user_rejected",
    status: "user_rejected",
    terminalAt: rejectedAt,
    failureReason: input.reason ?? "User rejected the transaction.",
  }) ?? record;
}

export async function pollTransaction(hash: string, options: { network?: string; familyHint?: ChainFamily; expectation?: ConfirmationExpectation } = {}): Promise<PollTransactionResult> {
  const storage = getStorage();
  const record = storage.getByHash(hash);

  if (!record) {
    throw new TransactionLifecycleError("transaction_not_found", `Transaction ${hash} not found in lifecycle store.`, { hash });
  }

  if (isImmutableTerminal(record.lifecycleStatus)) {
    return { transaction: record, polled: false, terminalReached: true, events: storage.listEvents(record.hash) };
  }

  const family = options.familyHint ?? record.chainFamily;
  const network = options.network ?? record.network;
  const adapter = family === "stellar" ? getStellarChainAdapter({ network }) : getEvmChainAdapter({ network });
  const adapterExpectation = buildChainExpectation(family, options.expectation ?? {
    walletAddress: record.walletAddress,
    sourceAccount: record.sourceAccount,
    expectedEffects: record.expectedEffects,
  });
  const pollResult = adapterExpectation
    ? await adapter.poll(hash as never, { expectation: adapterExpectation })
    : await adapter.poll(hash as never);
  const polledAt = new Date().toISOString();
  const nextStatus = mapToLifecycleStatus(pollResult.status);

  const recentEvents = storage.listEvents(hash);
  const recentPolled = recentEvents.find((event) => event.event === "polled");
  const recentPolledAt = recentPolled ? new Date(recentPolled.occurredAt).getTime() : 0;
  if (!recentPolledAt || Date.now() - recentPolledAt >= POLL_INTERVAL_MS) {
    storage.appendEvent(hash, "polled", {
      network,
      providerUrl: pollResult.providerUrl,
      status: pollResult.status,
    }, { label: family === "stellar" ? "stellar_rpc" : "evm_rpc", url: pollResult.providerUrl });
  }

  if (nextStatus === "pending" || nextStatus === "submitted") {
    const updated = storage.update(hash, { lifecycleStatus: nextStatus, status: nextStatus, lastPolledAt: polledAt }) ?? record;
    return { transaction: updated, polled: true, terminalReached: false, events: storage.listEvents(hash) };
  }

  const eventName = nextStatus === "confirmed" ? "confirmed" : nextStatus === "failed" ? "failed" : nextStatus === "replaced" ? "replaced" : "expired";
  const revertReason = "revertReason" in pollResult ? pollResult.revertReason ?? `Remote provider reported ${nextStatus}.` : `Remote provider reported ${nextStatus}.`;
  storage.appendEvent(hash, eventName, {
    network,
    providerUrl: pollResult.providerUrl,
    revertReason,
  }, { label: family === "stellar" ? "stellar_rpc" : "evm_rpc", url: pollResult.providerUrl });

  const updated = storage.update(hash, {
    lifecycleStatus: nextStatus,
    status: nextStatus,
    lastPolledAt: polledAt,
    terminalAt: polledAt,
    failureReason: revertReason,
  }) ?? record;

  return { transaction: updated, polled: true, terminalReached: true, events: storage.listEvents(hash) };
}

export async function expireTransactionIfStale(hash: string, options: { now?: () => Date; ttlMs?: number } = {}): Promise<{ expired: boolean; transaction?: TransactionRecord; events: TransactionLifecycleEvent[] }> {
  const storage = getStorage();
  const record = storage.getByHash(hash);

  if (!record || isImmutableTerminal(record.lifecycleStatus)) {
    return { expired: false, transaction: record, events: storage.listEvents(hash) };
  }

  const ttl = options.ttlMs ?? SUBMISSION_TTL_MS;
  const nowFn = options.now ?? (() => new Date());
  const nowMs = nowFn().getTime();
  const submittedAtTs = record.submittedAt ? new Date(record.submittedAt).getTime() : new Date(record.createdAt).getTime();
  const elapsed = nowMs - submittedAtTs;

  if (elapsed < ttl) {
    return { expired: false, transaction: record, events: storage.listEvents(hash) };
  }

  const polledAt = new Date(nowMs).toISOString();
  const updated = storage.update(hash, {
    lifecycleStatus: "expired",
    status: "expired",
    terminalAt: polledAt,
    lastPolledAt: polledAt,
    failureReason: "Submission TTL exceeded without a terminal response from chain provider.",
  }) ?? record;

  storage.appendEvent(hash, "expired", { ttlMs: ttl, elapsedMs: elapsed });

  return { expired: true, transaction: updated, events: storage.listEvents(hash) };
}

function mapToLifecycleStatus(status: EvmTerminalStatus | StellarTerminalStatus): TransactionLifecycleStatus {
  switch (status) {
    case "confirmed":
      return "confirmed";
    case "failed":
      return "failed";
    case "replaced":
      return "replaced";
    case "expired":
      return "expired";
    case "pending":
      return "pending";
    case "submitted":
    default:
      return "submitted";
  }
}

export function listHashEvents(hash: string): TransactionLifecycleEvent[] {
  return listTransactionLifecycleEvents(hash);
}
