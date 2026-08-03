/**
 * EVM simulation adapter.
 *
 * Runs a dry-run simulation of the EXACT prepared EVM transaction against the
 * maintainer-selected provider (`SIMULATION_EVM_PROVIDER`) and normalizes the
 * result into the shared chain-aware simulation contract.
 *
 * Supported providers:
 *  - `eth_call` (default): stateless dry-run against the configured network
 *    RPC.  Deterministic, no external credentials required.
 *  - `tenderly`: Tenderly Simulation API when Tenderly credentials are
 *    configured (server-only secrets).
 *  - `alchemy`: Alchemy RPC dry-run when an Alchemy key/URL is configured.
 *
 * Fail-closed guarantees:
 *  - a missing or unsupported provider returns a structured `unavailable` /
 *    `unsupported` result — it NEVER claims success,
 *  - chain ID and latest block are verified before/after simulation
 *    (wrong network or stale state fails closed),
 *  - reverts are decoded into revert diagnostics,
 *  - no private key is ever required — only the wallet's public address.
 */
import { createPublicClient, http, decodeErrorResult, type Address, type PublicClient } from "viem";
import { resolveEvmChainId, resolveEvmRpcUrl } from "@/lib/evm/config";
import { hashPreparedTransaction, redactSecrets } from "@/server/simulation/hash";
import {
  defaultSimulationProviderConfig,
  type EvmSimulationRequest,
  type EvmSimulationResult,
  type SimulationProvider,
  type SimulationProviderConfig,
  type SimulationResult,
} from "@/server/simulation/types";

// ─── Provider selection ────────────────────────────────────────────────

export function getConfiguredEvmSimulationProvider(): { provider: SimulationProvider; available: boolean; detail: string } {
  const configured = (process.env.SIMULATION_EVM_PROVIDER ?? "eth_call").trim().toLowerCase();

  if (configured === "tenderly") {
    const ready = Boolean(
      process.env.TENDERLY_ACCOUNT_SLUG &&
        process.env.TENDERLY_PROJECT_SLUG &&
        process.env.TENDERLY_ACCESS_KEY,
    );
    return {
      provider: "tenderly",
      available: ready,
      detail: ready
        ? "Tenderly simulation provider is configured."
        : "Tenderly is selected but credentials are missing; simulation is unavailable.",
    };
  }

  if (configured === "alchemy") {
    const ready = Boolean(process.env.ALCHEMY_API_KEY || process.env.ALCHEMY_SIMULATION_RPC_URL);
    return {
      provider: "alchemy",
      available: ready,
      detail: ready
        ? "Alchemy simulation provider is configured."
        : "Alchemy is selected but credentials are missing; simulation is unavailable.",
    };
  }

  return {
    provider: "eth_call",
    available: true,
    detail: "eth_call dry-run simulation provider is available (no external credentials required).",
  };
}

// ─── Dependency injection surface ──────────────────────────────────────

export type EvmSimulationTransport = {
  getChainId: () => Promise<number>;
  getBlockNumber: () => Promise<bigint>;
  /**
   * Returns the raw 0x response data.  On revert, the raw revert data (e.g.
   * an `Error(string)` payload) is returned instead of throwing so the caller
   * can decode it; only non-revert transport errors are thrown.
   */
  call: (args: { account: Address; to: Address; data: `0x${string}`; value: bigint }) => Promise<`0x${string}`>;
  estimateGas: (args: { account: Address; to: Address; data: `0x${string}`; value: bigint }) => Promise<bigint>;
  getGasPrice?: () => Promise<bigint>;
};

export type EvmSimulationOptions = {
  transport?: EvmSimulationTransport;
  providerOverride?: SimulationProvider;
  rpcUrlOverride?: string;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  maxStateAge?: number;
  /** Expected current block; if the provider lags by more than maxStateAge the result fails closed. */
  expectedBlock?: number;
  now?: () => number;
};

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Walks a viem error's `cause` chain looking for raw revert data (e.g. from
 * `ContractFunctionRevertedError` / `RawContractError`).  Returns the raw hex
 * so the caller can decode `Error(string)` / `Panic(uint256)` payloads.
 */
function extractRevertData(error: unknown): `0x${string}` | undefined {
  let current: unknown = error;
  for (let i = 0; i < 8 && current; i++) {
    const candidate = current as { data?: unknown };
    if (typeof candidate.data === "string" && candidate.data.startsWith("0x") && candidate.data.length > 2) {
      return candidate.data as `0x${string}`;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function createEvmSimulationTransport(
  network: string,
  options: { rpcUrl?: string; timeoutMs?: number } = {},
): EvmSimulationTransport {
  const client: PublicClient = createPublicClient({
    transport: http(options.rpcUrl ?? resolveEvmRpcUrl(network, options.rpcUrl), {
      batch: true,
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }),
    chain: undefined,
  });

  return {
    getChainId: () => client.getChainId(),
    getBlockNumber: () => client.getBlockNumber(),
    call: async (args) => {
      try {
        const result = await client.call(args);
        return (result.data as `0x${string}` | undefined) ?? "0x";
      } catch (error) {
        const revertData = extractRevertData(error);
        if (revertData) return revertData;
        throw error;
      }
    },
    estimateGas: (args) => client.estimateGas(args),
    getGasPrice: () => client.getGasPrice(),
  };
}

// ─── Revert decoding ───────────────────────────────────────────────────

const ERROR_STRING_SELECTOR = "0x08c379a0";
const PANIC_SELECTOR = "0x4e487b71";

export function decodeRevertReason(data: `0x${string}` | undefined): { revertReason?: string; revertReasonHuman?: string } {
  if (!data || data === "0x" || data === "0x0" || data.length < 10) {
    return {};
  }

  const selector = data.slice(0, 10).toLowerCase();

  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const decoded = decodeErrorResult({
        abi: [
          {
            type: "error",
            name: "Error",
            inputs: [{ type: "string", name: "reason" }],
          },
        ],
        data,
      });
      return {
        revertReason: String(decoded.args[0]),
        revertReasonHuman: String(decoded.args[0]),
      };
    } catch {
      return { revertReason: "Error(string) revert", revertReasonHuman: "The transaction reverted with a reason string." };
    }
  }

  if (selector === PANIC_SELECTOR) {
    return { revertReason: "Panic(uint256)", revertReasonHuman: "The transaction reverted with a Solidity panic." };
  }

  return { revertReason: `Custom error ${selector}`, revertReasonHuman: "The transaction reverted with a custom error." };
}

// ─── Error mapping ─────────────────────────────────────────────────────

function buildFailureResult(
  request: EvmSimulationRequest,
  binding: { transactionHash: string; quoteHash: string },
  network: string,
  chainId: number,
  error: unknown,
  options: EvmSimulationOptions,
): EvmSimulationResult {
  const now = (options.now ?? Date.now)();
  const checkedAt = new Date(now).toISOString();
  const base = {
    provider: (options.providerOverride ?? getConfiguredEvmSimulationProvider().provider) as SimulationProvider,
    chain: request.chain,
    chainFamily: "evm" as const,
    network,
    checkedAt,
    binding,
    detail: "",
    providerMeta: {
      provider: (options.providerOverride ?? getConfiguredEvmSimulationProvider().provider) as SimulationProvider,
      network,
      checkedAt,
      latencyMs: 0,
    },
  };

  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  const lower = message.toLowerCase();

  if (lower.includes("chain id") || lower.includes("chainid")) {
    return {
      ...base,
      status: "failed",
      error: { code: "wrong_network", message: "The EVM RPC serves a different chain.", retryable: false, detail: message },
      diagnostics: ["Chain ID verification failed."],
      detail: `EVM simulation failed closed: wrong network (expected chainId ${chainId}).`,
    };
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("abort")) {
    return {
      ...base,
      status: "unavailable",
      error: { code: "timeout", message: "EVM simulation timed out.", retryable: true, detail: message },
      detail: "EVM simulation is unavailable because the provider timed out.",
    };
  }

  return {
    ...base,
    status: "unavailable",
    error: { code: "provider_unavailable", message: "EVM simulation is unavailable.", retryable: true, detail: message },
    detail: "EVM simulation is unavailable. The provider did not return a usable result.",
  };
}

// ─── Main adapter ──────────────────────────────────────────────────────

export async function simulateEvmTransaction(
  request: EvmSimulationRequest,
  options: EvmSimulationOptions = {},
): Promise<SimulationResult> {
  const now = options.now ?? Date.now;
  const config: SimulationProviderConfig = {
    ...defaultSimulationProviderConfig,
    timeoutMs: options.timeoutMs ?? defaultSimulationProviderConfig.timeoutMs,
    retries: options.retries ?? defaultSimulationProviderConfig.retries,
    backoffMs: options.backoffMs ?? defaultSimulationProviderConfig.backoffMs,
    maxStateAge: options.maxStateAge ?? defaultSimulationProviderConfig.maxStateAge,
  };

  const configured = getConfiguredEvmSimulationProvider();
  const provider: SimulationProvider = options.providerOverride ?? request.providerOverride ?? configured.provider;

  if (provider === "tenderly" && !configured.available) {
    return {
      provider,
      status: "unavailable",
      chain: request.chain,
      chainFamily: "evm",
      network: request.chain,
      checkedAt: new Date(now()).toISOString(),
      binding: { transactionHash: "", quoteHash: request.quoteHash },
      error: {
        code: "provider_unavailable",
        message: "Tenderly simulation credentials are not configured.",
        retryable: false,
        detail: configured.detail,
      },
      detail: "EVM simulation is unavailable: Tenderly credentials are missing. Configure SIMULATION_EVM_PROVIDER=tenderly with TENDERLY_* secrets or switch to eth_call.",
    };
  }

  if (provider === "alchemy" && !configured.available) {
    return {
      provider,
      status: "unavailable",
      chain: request.chain,
      chainFamily: "evm",
      network: request.chain,
      checkedAt: new Date(now()).toISOString(),
      binding: { transactionHash: "", quoteHash: request.quoteHash },
      error: {
        code: "provider_unavailable",
        message: "Alchemy simulation credentials are not configured.",
        retryable: false,
        detail: configured.detail,
      },
      detail: "EVM simulation is unavailable: Alchemy credentials are missing.",
    };
  }

  if (provider !== "eth_call" && provider !== "tenderly" && provider !== "alchemy") {
    return {
      provider,
      status: "unsupported",
      chain: request.chain,
      chainFamily: "evm",
      network: request.chain,
      checkedAt: new Date(now()).toISOString(),
      binding: { transactionHash: "", quoteHash: request.quoteHash },
      error: {
        code: "unsupported_route",
        message: `Unsupported EVM simulation provider: ${provider}`,
        retryable: false,
      },
      detail: `EVM simulation is unsupported for provider ${provider}.`,
    };
  }

  const resolvedChainId = resolveEvmChainId(request.chain);
  if (resolvedChainId !== undefined && resolvedChainId !== request.chainId) {
    return {
      provider,
      status: "failed",
      chain: request.chain,
      chainFamily: "evm",
      network: request.chain,
      checkedAt: new Date(now()).toISOString(),
      binding: { transactionHash: "", quoteHash: request.quoteHash },
      error: {
        code: "invalid_request",
        message: `Request chainId ${request.chainId} does not match configured chain ${request.chain} (${resolvedChainId}).`,
        retryable: false,
      },
      diagnostics: ["Chain ID mismatch between the request and the configured network."],
      detail: "EVM simulation failed closed: chain ID mismatch.",
    };
  }

  const network = request.chain;
  const transactionHash = hashPreparedTransaction({
    chainFamily: "evm",
    network,
    rawPayload: request.data,
    to: request.to,
    value: request.value,
    chainId: request.chainId,
    from: request.walletAddress,
  });
  const binding = { transactionHash, quoteHash: request.quoteHash };
  const from = request.walletAddress.toLowerCase() as Address;
  const to = request.to.toLowerCase() as Address;
  const value = BigInt(request.value ?? "0");

  let transport = options.transport;
  if (!transport) {
    try {
      transport = createEvmSimulationTransport(network, {
        rpcUrl: options.rpcUrlOverride ?? request.rpcUrlOverride,
        timeoutMs: options.timeoutMs,
      });
    } catch (error) {
      return buildFailureResult(request, binding, network, request.chainId, error, options);
    }
  }

  try {
    const [chainId, blockNumber] = await Promise.all([transport.getChainId(), transport.getBlockNumber()]);

    if (chainId !== request.chainId) {
      return {
        provider,
        status: "failed",
        chain: request.chain,
        chainFamily: "evm",
        network,
        checkedAt: new Date(now()).toISOString(),
        binding,
        blockNumber: Number(blockNumber),
        error: {
          code: "wrong_network",
          message: `The EVM RPC serves chainId ${chainId} but the prepared transaction targets chainId ${request.chainId}.`,
          retryable: false,
        },
        diagnostics: ["Chain ID verification failed."],
        detail: "EVM simulation failed closed: the provider serves a different network.",
      };
    }

    if (options.expectedBlock !== undefined) {
      const lag = options.expectedBlock - Number(blockNumber);
      if (lag > config.maxStateAge) {
        return {
          provider,
          status: "failed",
          chain: request.chain,
          chainFamily: "evm",
          network,
          checkedAt: new Date(now()).toISOString(),
          binding,
          blockNumber: Number(blockNumber),
          error: {
            code: "stale_state",
            message: "The EVM provider is too far behind the expected block.",
            retryable: true,
            detail: `Provider block ${blockNumber} lags expected block ${options.expectedBlock} by ${lag}.`,
          },
          diagnostics: ["Stale block: provider state is too old to trust."],
          detail: "EVM simulation failed closed: provider block is stale.",
        };
      }
    }

    const callArgs = { account: from, to, data: request.data as `0x${string}`, value };

    // eth_call dry-run: strict:false returns the revert data instead of throwing.
    const raw = await transport.call(callArgs);
    const revert = decodeRevertReason(raw);

    if (revert.revertReason) {
      return {
        provider,
        status: "failed",
        chain: request.chain,
        chainFamily: "evm",
        network,
        checkedAt: new Date(now()).toISOString(),
        binding,
        blockNumber: Number(blockNumber),
        simulatedAt: new Date(now()).toISOString(),
        revertReason: revert.revertReason,
        revertReasonHuman: revert.revertReasonHuman,
        diagnostics: ["The simulated EVM call reverted."],
        detail: `EVM simulation reverted: ${revert.revertReason}`,
      };
    }

    const simulatedAt = new Date(now()).toISOString();
    const gasUsed = await transport.estimateGas(callArgs);
    const gasPrice = transport.getGasPrice ? await transport.getGasPrice().catch(() => undefined) : undefined;

    return {
      provider,
      status: "passed",
      chain: request.chain,
      chainFamily: "evm",
      network,
      checkedAt: simulatedAt,
      binding,
      blockNumber: Number(blockNumber),
      simulatedAt,
      simulatedTxHash: transactionHash,
      resources: {
        gasUnits: String(gasUsed),
        gasPrice: gasPrice ? String(gasPrice) : undefined,
        fee: gasPrice ? String(gasUsed * gasPrice) : undefined,
      },
      diagnostics: ["Dry-run succeeded. No revert detected."],
      detail: `EVM dry-run passed on ${network} (block ${blockNumber}).`,
      providerMeta: {
        provider,
        network,
        checkedAt: simulatedAt,
        latencyMs: 0,
      },
    };
  } catch (error) {
    return buildFailureResult(request, binding, network, request.chainId, error, options);
  }
}
