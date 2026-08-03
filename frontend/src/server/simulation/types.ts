/**
 * Chain-aware simulation request/result contract.
 *
 * This is the single normalized interface between simulation providers
 * (Soroban RPC, and the maintainer-selected EVM provider) and the rest of
 * the application.  Every provider maps onto the same discriminated typed
 * contract so the execution agent never depends on chain-specific fields.
 *
 * The contract deliberately:
 *  - binds a result to the exact prepared transaction and quote (transactionHash
 *    and quoteHash) so a simulation can never be reused for a different intent,
 *  - fails closed: reverts, timeouts, wrong-network, stale state, malformed
 *    responses, and missing providers never claim success,
 *  - carries `checkedAt` and network/ledger/block context for freshness gates,
 *  - redacts signed XDR and secrets before anything is persisted or logged.
 */

import type { ChainFamily } from "@/lib/chainIdentity";

// ─── Provider identifiers ─────────────────────────────────────────────

export type SimulationProvider =
  | "soroban_rpc"
  | "eth_call"
  | "tenderly"
  | "alchemy"
  | "not_required"
  | "unsupported";

export type SimulationStatus =
  | "not_required"
  | "pending"
  | "passed"
  | "failed"
  | "unavailable"
  | "unsupported";

// ─── Binding ───────────────────────────────────────────────────────────

/**
 * A simulation is bound to the exact prepared transaction and quote by
 * content hashes.  `transactionHash` is derived from the server-built raw
 * payload (calldata / XDR) plus its chain and source account; `quoteHash` is
 * derived from the canonical quote inputs.  Reusing a result with different
 * payloads or quotes is therefore always rejected.
 */
export type SimulationBinding = {
  /** SHA-256 of the exact prepared transaction payload + chain context. */
  transactionHash: string;
  /** SHA-256 of the canonical quote this simulation was run against. */
  quoteHash: string;
};

// ─── Normalized diagnostics ────────────────────────────────────────────

export type SimulationBalanceDelta = {
  token: string;
  symbol: string;
  /** Current balance reported by the provider, decimal string. */
  currentBalance?: string;
  /** Signed change as reported by the provider (e.g. "-1230000", "+42"). */
  delta: string;
  direction: "inflow" | "outflow" | "none";
};

export type SimulationAllowanceRisk = {
  token: string;
  spender: string;
  /** Allowance before the simulated call (decimal string). */
  currentAllowance?: string;
  /** Allowance after the simulated call (decimal string). */
  newAllowance?: string;
  isInfinite: boolean;
  /** Human readable detail for the UI. */
  detail?: string;
};

/**
 * Stellar authorization risk: which contracts require the wallet to sign an
 * authorization entry before the simulated call can succeed.  Mirrors
 * EVM allowance risk but for Soroban `require_auth`.
 */
export type SimulationAuthorizationRisk = {
  contractId: string;
  /** Auth entries the simulator reported as required. */
  requiredAuthCount: number;
  /** True when the wallet must authorise this contract invocation. */
  requiresUserAuth: boolean;
  detail?: string;
};

export type SimulationFootprint = {
  readOnly?: string[];
  readWrite?: string[];
  /** Ledger entries that must be restored before submission. */
  restoreRequired?: string[];
};

export type SimulationResourceUsage = {
  /** Gas / instructions units for EVM, or Soroban resource units otherwise. */
  gasUnits?: string;
  gasPrice?: string;
  /** Fee estimate in the native token, decimal string. */
  fee?: string;
  /** Fee in stroops for Stellar. */
  ledgerFee?: string;
  /** Number of Stellar operations. */
  operationsCount?: number;
  /** True when Soroban reported a restore-preamble requirement. */
  requiresRestore?: boolean;
};

export type SimulationExpectedOutput = {
  token: string;
  amount: string;
  /** USD estimate at simulation time when a price is available. */
  usdValue?: number;
};

export type SimulationProviderMeta = {
  provider: SimulationProvider;
  network: string;
  /** ISO timestamp when the provider was checked. */
  checkedAt: string;
  latencyMs: number;
  providerUrl?: string;
  fallbackUsed?: boolean;
  requestId?: string;
};

// ─── Error codes ───────────────────────────────────────────────────────

export type SimulationErrorCode =
  | "timeout"
  | "network_error"
  | "wrong_network"
  | "stale_state"
  | "malformed_request"
  | "malformed_response"
  | "revert"
  | "unsupported_route"
  | "provider_unavailable"
  | "not_required"
  | "invalid_request";

export type SimulationError = {
  code: SimulationErrorCode;
  message: string;
  retryable: boolean;
  detail?: string;
};

// ─── Requests ──────────────────────────────────────────────────────────

type SimulationRequestBase = {
  /** Normalized chain id (e.g. "stellar-testnet", "ethereum", "goat"). */
  chain: string;
  chainFamily: ChainFamily;
  /** The wallet that will sign the eventual transaction (public key only). */
  walletAddress: string;
  /**
   * Content hash of the quote the prepared transaction was built from.
   * Required — the simulation is bound to this quote.
   */
  quoteHash: string;
  /** Human-readable method (e.g. "swap_exact_tokens_for_tokens"). */
  method?: string;
  /** Max age of the latest ledger/block before the simulation fails closed. */
  maxStateAge?: number;
  /** Expected effects used to sanity-check the simulation outcome. */
  expectedEffects?: Array<{
    kind: "transfer" | "swap" | "approval" | "contract_call" | "publish_risk";
    fromToken?: string;
    toToken?: string;
    fromAddress?: string;
    toAddress?: string;
    amount?: string;
    contractAddress?: string;
    method?: string;
    assetKey?: string;
  }>;
};

export type StellarSimulationRequest = SimulationRequestBase & {
  chainFamily: "stellar";
  /** Unsigned base64 XDR envelope of the exact prepared transaction. */
  xdr: string;
  /** Stellar source account (G address). */
  sourceAccount: string;
  /** Stellar network passphrase expected for this transaction. */
  networkPassphrase?: string;
  /** Fee in stroops. */
  feeStroops?: number;
  /** Expected network passphrase — mismatch fails closed. */
  expectedPassphrase?: string;
};

export type EvmSimulationRequest = SimulationRequestBase & {
  chainFamily: "evm";
  /** EIP-155 chain id — mismatch fails closed. */
  chainId: number;
  /** Target contract address. */
  to: string;
  /** Encoded calldata (0x-prefixed hex) of the exact prepared transaction. */
  data: string;
  /** Native value in wei as a decimal string. */
  value?: string;
  /** Optional explicit provider override for testing. */
  providerOverride?: SimulationProvider;
  /** Optional explicit RPC URL override for testing. */
  rpcUrlOverride?: string;
};

export type SimulationRequest = StellarSimulationRequest | EvmSimulationRequest;

// ─── Results ───────────────────────────────────────────────────────────

type SimulationResultBase = {
  provider: SimulationProvider;
  status: SimulationStatus;
  /** Normalized error for fail-closed states. */
  error?: SimulationError;
  chain: string;
  chainFamily: ChainFamily;
  network: string;
  checkedAt: string;
  binding: SimulationBinding;
  /** ISO timestamp when the provider answered. */
  simulatedAt?: string;
  /** Stellar ledger or EVM block the simulation ran against. */
  ledgerSeq?: number;
  blockNumber?: number;
  /** Quote expiry carried through so the freshness gate can enforce it. */
  quoteExpiry?: string;
  revertReason?: string;
  revertReasonHuman?: string;
  diagnostics?: string[];
  balanceDeltas?: SimulationBalanceDelta[];
  allowanceRisk?: SimulationAllowanceRisk[];
  authorizationRisk?: SimulationAuthorizationRisk[];
  footprint?: SimulationFootprint;
  resources?: SimulationResourceUsage;
  expectedOutput?: SimulationExpectedOutput;
  detail: string;
  providerMeta?: SimulationProviderMeta;
};

export type StellarSimulationResult = SimulationResultBase & {
  chainFamily: "stellar";
  /** Redacted — the raw signed XDR is never persisted. */
  simulatedXdrHash?: string;
  /** True when the provider reported a restore-preamble. */
  restoreRequired?: boolean;
};

export type EvmSimulationResult = SimulationResultBase & {
  chainFamily: "evm";
  /** Redacted — the raw signed transaction is never persisted. */
  simulatedTxHash?: string;
};

export type SimulationResult = StellarSimulationResult | EvmSimulationResult;

// ─── Provider config ───────────────────────────────────────────────────

export type SimulationProviderConfig = {
  /** Maximum time to wait for a provider response (ms). */
  timeoutMs: number;
  /** Number of retries on transient failure. */
  retries: number;
  /** Base backoff delay (ms). */
  backoffMs: number;
  /** Max ledger/block age before a result is stale (blocks/ledgers). */
  maxStateAge: number;
};

export const defaultSimulationProviderConfig: SimulationProviderConfig = {
  timeoutMs: 15_000,
  retries: 1,
  backoffMs: 500,
  maxStateAge: 50,
};

// ─── Normalization helpers ─────────────────────────────────────────────

export function isSimulationSuccess(result: SimulationResult): boolean {
  return result.status === "passed";
}

export function isSimulationFailure(result: SimulationResult): boolean {
  return result.status === "failed";
}

export function isSimulationUsable(result: SimulationResult): boolean {
  return (
    result.status === "passed" &&
    Boolean(result.simulatedAt) &&
    Boolean(result.checkedAt) &&
    Boolean(result.binding.transactionHash) &&
    Boolean(result.binding.quoteHash)
  );
}

export function simulationError(result: SimulationResult): SimulationError | undefined {
  return result.error;
}
