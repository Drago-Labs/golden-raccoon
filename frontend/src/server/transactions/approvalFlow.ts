/**
 * Explicit wallet approval flow for EVM calldata and Stellar transaction XDR.
 *
 * This module validates that a prepared transaction is safe to approve given:
 *   - The prepared record exists and is in "prepared" lifecycle status
 *   - The connected wallet address matches the prepared transaction's owner
 *   - The connected network matches the prepared transaction's network
 *   - The plan has not expired (10 min TTL from preparation)
 *   - The recommended action is not avoid / manual_review / no_action
 *
 * On success it returns a discriminated `PreparedTransactionPayload` that the
 * client sends to the user's wallet (wagmi or Stellar Wallets Kit) for signing.
 * The server never sees the private key or seed phrase – the signed payload
 * goes to POST /api/execute/submit for broadcast.
 */
import type {
  ApprovalValidationResult,
  ApproveTransactionInput,
  ChainFamily,
  EvmPreparedTransactionPayload,
  PreparedTransactionPayload,
  StellarPreparedTransactionPayload,
  TransactionRecord,
} from "@/server/types";
import {
  getTransactionRecordByIdempotencyKey,
  updateTransactionRecord,
  appendLifecycleEventByName,
  isImmutableTerminal,
} from "@/server/storage";

const PREPARATION_TTL_MS = 10 * 60_000; // 10 minutes

/** Actions for which the server will NEVER allow a wallet signing prompt. */
const UNSAFE_ACTIONS = new Set(["avoid", "manual_review", "no_action"]);

function normalizeWallet(value?: string): string | undefined {
  return value?.trim().toLowerCase();
}

/**
 * Validate that a prepared transaction is safe for the user's wallet to sign.
 * Returns a detailed result with the typed payload when all checks pass.
 */
export async function validateApproval(
  input: ApproveTransactionInput,
  connectedWallet?: string,
  connectedNetwork?: string,
): Promise<ApprovalValidationResult> {
  const normalizedConnected = normalizeWallet(connectedWallet);
  const normalizedInputWallet = normalizeWallet(input.walletAddress);

  // 1. Look up the prepared transaction
  const record = getTransactionRecordByIdempotencyKey(input.walletAddress, input.idempotencyKey);

  if (!record) {
    return {
      allowed: false,
      blockedReason: "No prepared transaction found for this idempotency key. Call POST /api/execute/prepare first.",
      walletOk: true,
      networkOk: true,
      expired: false,
      actionSafe: true,
    };
  }

  // 2. Check lifecycle — only "prepared" can be approved
  if (isImmutableTerminal(record.lifecycleStatus)) {
    return {
      allowed: false,
      blockedReason: `Transaction is already in terminal state: ${record.lifecycleStatus}. A new prepare is required.`,
      walletOk: true,
      networkOk: true,
      expired: record.lifecycleStatus === "expired",
      actionSafe: true,
    };
  }

  if (record.lifecycleStatus !== "prepared") {
    return {
      allowed: false,
      blockedReason: `Transaction lifecycle is "${record.lifecycleStatus}". Only "prepared" transactions can be approved.`,
      walletOk: true,
      networkOk: true,
      expired: false,
      actionSafe: true,
    };
  }

  // 3. Check expiry (10 min TTL from creation)
  const createdAt = new Date(record.createdAt).getTime();
  const elapsed = Date.now() - createdAt;
  const expired = elapsed > PREPARATION_TTL_MS;

  if (expired) {
    // Mark as expired in storage
    updateTransactionRecord(record.hash, {
      lifecycleStatus: "expired",
      status: "expired",
      terminalAt: new Date().toISOString(),
      failureReason: "Preparation TTL expired before approval.",
    });
    appendLifecycleEventByName(record.hash, "expired", {
      reason: "Preparation TTL expired before wallet approval.",
      ttlMs: PREPARATION_TTL_MS,
      elapsedMs: elapsed,
    });

    return {
      allowed: false,
      blockedReason: `The prepared transaction expired after ${Math.round(PREPARATION_TTL_MS / 60_000)} minutes. Please prepare a new plan.`,
      walletOk: true,
      networkOk: true,
      expired: true,
      actionSafe: true,
    };
  }

  // 4. Check wallet match
  const walletOk =
    !normalizedConnected ||
    !record.walletAddress ||
    normalizedConnected === normalizeWallet(record.walletAddress);

  if (!walletOk) {
    return {
      allowed: false,
      blockedReason: `Connected wallet ${connectedWallet} does not match the prepared transaction's owner ${record.walletAddress}.`,
      walletOk: false,
      networkOk: true,
      expired: false,
      actionSafe: true,
    };
  }

  // 5. Check network match
  const networkOk =
    !connectedNetwork ||
    !record.network ||
    connectedNetwork.toLowerCase() === record.network.toLowerCase();

  if (!networkOk) {
    return {
      allowed: false,
      blockedReason: `Connected network ${connectedNetwork} does not match the prepared transaction's network ${record.network}. Switch networks in your wallet.`,
      walletOk: true,
      networkOk: false,
      expired: false,
      actionSafe: true,
    };
  }

  // 6. Check action safety — block avoid/manual_review/no_action
  const decisionAction = record.decisionAction;
  const actionSafe = !decisionAction || !UNSAFE_ACTIONS.has(decisionAction);

  if (!actionSafe) {
    return {
      allowed: false,
      blockedReason: `The recommended action "${decisionAction}" cannot be signed. Only swap, reduce_exposure, and trustline actions are signable.`,
      walletOk: true,
      networkOk: true,
      expired: false,
      actionSafe: false,
    };
  }

  // 7. Build the typed payload for the wallet
  const payload = buildTypedPayload(record);

  return {
    allowed: true,
    payload,
    walletOk: true,
    networkOk: true,
    expired: false,
    actionSafe: true,
  };
}

/**
 * Build a discriminated `PreparedTransactionPayload` from the transaction record.
 * The payload encodes everything the wallet needs to construct the signing prompt.
 */
function buildTypedPayload(record: TransactionRecord): PreparedTransactionPayload {
  const family = record.chainFamily;

  if (family === "evm") {
    return buildEvmPayload(record);
  }

  return buildStellarPayload(record);
}

function buildEvmPayload(record: TransactionRecord): EvmPreparedTransactionPayload {
  // Extract the target contract from expected effects or fall back to the asset
  const toContract =
    record.expectedEffects?.find((e) => e.contractAddress)?.contractAddress ?? record.asset;

  return {
    chainFamily: "evm",
    to: toContract.startsWith("0x") ? toContract : `0x${toContract}`,
    data: record.calldata ?? "0x",
    value: "0",
    chainId: parseEvmChainId(record.network),
    gas: undefined,
    gasPrice: undefined,
    method: record.expectedEffects?.find((e) => e.method)?.method ?? record.type,
    displayParams: {
      action: record.decisionAction ?? "swap",
      asset: record.asset,
      valueUsd: record.valueUsd,
      policyAllowed: record.policyStatus?.allowed,
      policyViolations: record.policyStatus?.violations,
      expectedEffects: record.expectedEffects?.map((e) => ({
        kind: e.kind,
        from: e.fromAddress ?? record.walletAddress,
        to: e.toAddress,
        amount: e.amount,
      })),
    },
  };
}

function buildStellarPayload(record: TransactionRecord): StellarPreparedTransactionPayload {
  const stellarNetwork = record.network.startsWith("stellar-")
    ? record.network
    : "stellar-testnet";
  const networkPassphrase =
    stellarNetwork === "stellar-pubnet"
      ? "Public Global Stellar Network ; September 2015"
      : "Test SDF Network ; September 2015";

  const operations = (record.expectedEffects ?? []).map((effect) => ({
    type: effect.kind === "contract_call" ? "invokeHostFunction" : effect.kind === "publish_risk" ? "invokeHostFunction" : "payment",
    asset: effect.assetKey ?? effect.contractAddress,
    amount: effect.amount,
    destination: effect.toAddress,
    contractId: effect.contractAddress,
    method: effect.method,
  }));

  return {
    chainFamily: "stellar",
    xdr: record.stellarDetails?.envelopeXdr ?? "",
    networkPassphrase,
    sourceAccount: record.sourceAccount ?? record.walletAddress ?? "",
    operations,
    fee: record.stellarDetails?.feeCharged,
    sequence: record.stellarDetails?.sequence,
    timeBounds: undefined,
    method: record.decisionAction ?? "swap",
    displayParams: {
      action: record.decisionAction ?? "swap",
      asset: record.asset,
      valueUsd: record.valueUsd,
      operationCount: operations.length,
      policyAllowed: record.policyStatus?.allowed,
      policyViolations: record.policyStatus?.violations,
    },
  };
}

function parseEvmChainId(network: string): number {
  const chainIdMap: Record<string, number> = {
    ethereum: 1,
    base: 8453,
    bsc: 56,
    arbitrum: 42161,
    polygon: 137,
    optimism: 10,
    avalanche: 43114,
    goat: 48816,
    line: 59144,
    scroll: 534352,
    zksync: 324,
    berachain: 80094,
    sonic: 146,
    unichain: 130,
    worldchain: 480,
    monad: 143,
    plasma: 9745,
  };

  const normalized = network.trim().toLowerCase();
  return chainIdMap[normalized] ?? 1;
}
