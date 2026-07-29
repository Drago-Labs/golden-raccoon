import { createPublicClient, decodeEventLog, http, keccak256, parseAbiItem, recoverTransactionAddress, toFunctionSelector, type Hash, type PublicClient } from "viem";
import type { ChainFamily } from "@/lib/chainIdentity";
import { isTransactionHashForChain } from "@/lib/chainIdentity";
import { resolveEvmRpcUrl, resolveEvmChainId } from "@/lib/evm/config";

export type EvmTerminalStatus = "confirmed" | "failed" | "replaced" | "expired" | "pending" | "submitted";

export type EvmVerificationExpectation = {
  walletAddress?: string;
  expectedEffects?: Array<{
    kind: "transfer" | "swap" | "approval" | "contract_call" | "publish_risk";
    fromAddress?: string;
    toAddress?: string;
    contractAddress?: string;
    method?: string;
    methodSelector?: string;
    amountBaseUnits?: string;
    decimals?: number;
    requireObservedSource?: boolean;
  }>;
};

const ERC20_TRANSFER_TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ERC20_APPROVAL_TOPIC0 = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac14c23ccaa9";
const ERC20_ABI_ITEM_TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ERC20_ABI_ITEM_APPROVAL = parseAbiItem("event Approval(address indexed owner, address indexed spender, uint256 value)");

function extractMethodSelector(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed.startsWith("0x") || trimmed.length < 10) return undefined;
  return trimmed.slice(0, 10).toLowerCase();
}

function deriveMethodSelectorFromSignature(method: string): string | undefined {
  try {
    return toFunctionSelector(method).toLowerCase();
  } catch {
    return undefined;
  }
}

function compareAmounts(expected: bigint | string | undefined, observed: bigint | undefined): { matched: boolean; detail?: string } {
  if (expected === undefined) return { matched: true };
  if (observed === undefined) return { matched: false, detail: `expected amount ${String(expected)}, none observed in receipt logs` };
  const expectedBigInt = typeof expected === "string" ? BigInt(expected) : expected;
  if (observed !== expectedBigInt) {
    return { matched: false, detail: `expected amount ${expectedBigInt.toString()}, observed ${observed.toString()}` };
  }
  return { matched: true };
}

export type EvmSubmitResult = {
  hash: Hash;
  family: ChainFamily;
  network: string;
  status: EvmTerminalStatus;
  providerUrl: string;
  broadcastAcceptedAt?: string;
  detail: string;
  failureReason?: string;
};

export type EvmPollResult = {
  hash: Hash;
  family: ChainFamily;
  network: string;
  status: EvmTerminalStatus;
  blockNumber?: bigint;
  blockHash?: Hash;
  gasUsed?: bigint;
  effectiveGasPrice?: bigint;
  contractAddress?: string;
  revertReason?: string;
  providerUrl: string;
  polledAt: string;
  fromAddress?: string;
  toAddress?: string;
  matchedEffects?: boolean;
  verificationDetail?: string;
};

export type EvmAdapterOptions = {
  network: string;
  chainId?: number;
  rpcUrl?: string;
};

type EvmSimulatorConfig = {
  submitOutcome?: "submitted" | "rejected" | "expired" | "failed";
  pollOutcome?: "confirmed" | "failed" | "replaced" | "expired" | "pending";
  expectedEffects?: EvmVerificationExpectation["expectedEffects"];
};

const EVM_SIMULATOR = new Map<string, EvmSimulatorConfig>();

export function configureEvmSimulator(family: ChainFamily, network: string, config: EvmSimulatorConfig) {
  if (family !== "evm") return;
  EVM_SIMULATOR.set(`${family}:${network.toLowerCase()}`, config);
}

export function clearEvmSimulator() {
  EVM_SIMULATOR.clear();
}

function getEvmSimulator(family: ChainFamily, network: string) {
  return EVM_SIMULATOR.get(`${family}:${network.toLowerCase()}`);
}

function getEvmRpcUrl(options: EvmAdapterOptions): string {
  return resolveEvmRpcUrl(options.network, options.rpcUrl);
}

export function createEvmPublicClient(options: EvmAdapterOptions): PublicClient | null {
  const rpcUrl = getEvmRpcUrl(options);

  return createPublicClient({
    transport: http(rpcUrl, { batch: true, timeout: 8_000 }),
    chain: undefined,
  });
}

async function assertChainIdMatches(options: EvmAdapterOptions): Promise<void> {
  const client = createEvmPublicClient(options);
  if (!client) return;

  const expectedChainId = options.chainId ?? resolveEvmChainId(options.network);
  if (expectedChainId === undefined) return;

  try {
    const actualChainId = await client.getChainId();
    if (actualChainId !== expectedChainId) {
      throw new Error(
        `EVM chain ID mismatch: RPC reported ${actualChainId} but network "${options.network}" expects ${expectedChainId}. `
        + `Connected to the wrong network.`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("EVM chain ID mismatch")) {
      throw error;
    }
    throw new Error(
      `EVM RPC chain ID verification failed for ${options.network}: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

export async function deriveEvmTransactionHash(signedPayload: string): Promise<Hash> {
  const trimmed = signedPayload.trim();

  if (isTransactionHashForChain(trimmed, "evm")) {
    return trimmed as Hash;
  }

  if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    throw new Error("EVM signed payload must be a 0x-prefixed hex string.");
  }

  // For non-hash raw payloads, require a parseable signature then derive the hash.
  const recovered = await recoverTransactionAddress({ serializedTransaction: trimmed as never }).catch(() => {
    throw new Error("Could not parse the signed EVM transaction (missing or invalid signature).");
  });

  if (!recovered) {
    throw new Error("Could not recover sender address from the signed EVM transaction.");
  }

  return keccak256(trimmed as `0x${string}`);
}

export function getEvmChainAdapter(options: EvmAdapterOptions): {
  family: ChainFamily;
  network: string;
  deriveHash: (payload: string) => Promise<Hash>;
  submit: (
    payload: string,
    overrides?: { simulate?: EvmSimulatorConfig["submitOutcome"]; expectedEffects?: EvmVerificationExpectation["expectedEffects"] },
  ) => Promise<EvmSubmitResult>;
  poll: (hash: Hash, overrides?: { simulate?: EvmSimulatorConfig["pollOutcome"]; expectation?: EvmVerificationExpectation }) => Promise<EvmPollResult>;
} {
  const network = options.network;
  const family: ChainFamily = "evm";
  const providerUrl = getEvmRpcUrl(options);

  function verifyReceiptEffects(
    transaction: { from?: string; to?: string | null; input?: string } | undefined,
    receipt: { status?: string; contractAddress?: string | null; logs?: ReadonlyArray<{ address?: string; topics?: ReadonlyArray<string | null | undefined>; data?: string }> } | undefined,
    expectation: EvmVerificationExpectation | undefined,
  ): { matched: boolean; detail?: string } {
    if (!expectation) return { matched: true };

    if (expectation.walletAddress !== undefined) {
      if (!transaction?.from) {
        return { matched: false, detail: `expected wallet ${expectation.walletAddress} but transaction.from is absent` };
      }
      if (transaction.from.toLowerCase() !== expectation.walletAddress.toLowerCase()) {
        return { matched: false, detail: `on-chain sender ${transaction.from} does not match expected wallet ${expectation.walletAddress}` };
      }
    }

    const effects = expectation.expectedEffects ?? [];
    const observedSelector = extractMethodSelector(transaction?.input);

    for (const effect of effects) {
      if (effect.requireObservedSource !== false && effect.fromAddress) {
        if (!transaction?.from) {
          return { matched: false, detail: `${effect.kind} expected fromAddress ${effect.fromAddress}, observed absent (transaction.from missing)` };
        }
        if (transaction.from.toLowerCase() !== effect.fromAddress.toLowerCase()) {
          return { matched: false, detail: `${effect.kind} expected fromAddress ${effect.fromAddress}, observed ${transaction.from}` };
        }
      }

      if (effect.toAddress) {
        const observedTo = transaction?.to ?? receipt?.contractAddress ?? null;
        if (!observedTo) {
          return { matched: false, detail: `${effect.kind} expected toAddress ${effect.toAddress}, observed absent` };
        }
        if (observedTo.toString().toLowerCase() !== effect.toAddress.toLowerCase()) {
          return { matched: false, detail: `${effect.kind} expected toAddress ${effect.toAddress}, observed ${observedTo}` };
        }
      }

          const expectedSelector = (effect.methodSelector ?? (effect.method ? deriveMethodSelectorFromSignature(effect.method) : undefined))?.toLowerCase();
      if (expectedSelector) {
        if (!observedSelector) {
          return { matched: false, detail: `${effect.kind} expected method selector ${expectedSelector} but transaction.input is absent or too short` };
        }
        if (observedSelector !== expectedSelector) {
          return { matched: false, detail: `${effect.kind} expected method selector ${expectedSelector} (signature: ${effect.method}), observed ${observedSelector}` };
        }
      }

      if (effect.contractAddress) {
        const wantContract = effect.contractAddress.toLowerCase();
        const receiptContractMatches = !!receipt?.contractAddress && receipt.contractAddress.toLowerCase() === wantContract;
        const logMatches = Array.isArray(receipt?.logs) && receipt!.logs!.some((log) => (log.address ?? "").toLowerCase() === wantContract);
        if (!receiptContractMatches && !logMatches) {
          return { matched: false, detail: `${effect.kind} expected contract address ${effect.contractAddress}; not observed in receipt.contractAddress or logs` };
        }
      }

      // Amount verification: only runs when amountBaseUnits is supplied and the effect is a
      // value-bearing event (transfer/approval/swap). Skips silently otherwise so legacy
      // simulator fixtures remain green.
      if (effect.amountBaseUnits !== undefined && (effect.kind === "transfer" || effect.kind === "approval" || effect.kind === "swap")) {
        const targetTopic0 = effect.kind === "approval" ? ERC20_APPROVAL_TOPIC0 : ERC20_TRANSFER_TOPIC0;
        const candidateLogs = Array.isArray(receipt?.logs) ? receipt!.logs! : [];
        const matchingLog = effect.contractAddress
          ? candidateLogs.find((log) => (log.topics?.[0] ?? "").toLowerCase() === targetTopic0 && (log.address ?? "").toLowerCase() === effect.contractAddress!.toLowerCase())
          : candidateLogs.find((log) => (log.topics?.[0] ?? "").toLowerCase() === targetTopic0);

        if (!matchingLog) {
          return { matched: false, detail: `${effect.kind} expected amount ${String(effect.amountBaseUnits)} but no matching ${effect.kind === "approval" ? "Approval" : "Transfer"} log observed` };
        }

        let observedValue: bigint | undefined;
        try {
          const abiItem = effect.kind === "approval" ? ERC20_ABI_ITEM_APPROVAL : ERC20_ABI_ITEM_TRANSFER;
          const decoded = decodeEventLog({ abi: [abiItem], data: (matchingLog.data ?? "0x") as `0x${string}`, topics: [...(matchingLog.topics ?? [])] as unknown as [`0x${string}`, ...`0x${string}`[]] });
          observedValue = decoded.args.value as bigint;
        } catch (error) {
          return { matched: false, detail: `${effect.kind} expected amount ${String(effect.amountBaseUnits)} but log decoding failed: ${error instanceof Error ? error.message : "unknown"}` };
        }

        const amountCompare = compareAmounts(effect.amountBaseUnits, observedValue);
        if (!amountCompare.matched) {
          return { matched: false, detail: amountCompare.detail ?? `${effect.kind} amount mismatch` };
        }
      }
    }

    return { matched: true };
  }

  return {
    family,
    network,
    deriveHash: deriveEvmTransactionHash,
    async submit(payload, overrides) {
      const simulator = getEvmSimulator(family, network);
      const outcome = overrides?.simulate ?? simulator?.submitOutcome;

      if (outcome === "rejected") {
        throw new Error("EVM RPC rejected the transaction (nonce already used or insufficient funds).");
      }

      if (outcome === "expired") {
        throw new Error("EVM RPC submission expired before broadcast (stale sequence or dropped payload).");
      }

      if (outcome === "failed") {
        throw new Error("EVM RPC reported a fatal provider error during broadcast.");
      }

      const trimmed = payload.trim();
      const isPreHash = isTransactionHashForChain(trimmed, "evm");
      let hash: Hash;

      if (isPreHash) {
        hash = trimmed as Hash;
      } else if (!simulator && !outcome) {
        await assertChainIdMatches(options);
        const client = createEvmPublicClient(options);
        if (!client) {
          throw new Error("EVM RPC client could not be created for broadcast.");
        }
        try {
          const txHash = await client.sendRawTransaction({ serializedTransaction: trimmed as never });
          hash = txHash;
        } catch (error) {
          throw new Error(error instanceof Error ? `EVM RPC broadcast failed: ${error.message}` : "EVM RPC broadcast failed.");
        }
      } else {
        hash = await deriveEvmTransactionHash(payload);
      }

      return {
        hash,
        family,
        network,
        status: "submitted",
        providerUrl,
        broadcastAcceptedAt: new Date().toISOString(),
        detail: outcome
          ? `Simulated ${outcome} submit outcome for chain adapter tests.`
          : isPreHash
            ? "EVM transaction hash accepted as already broadcast (skip provider). "
            : `EVM signed transaction submitted to provider RPC (hash: ${hash}).`,
      };
    },
    async poll(hash, overrides) {
      const simulator = getEvmSimulator(family, network);
      const outcome = overrides?.simulate ?? simulator?.pollOutcome;
      const polledAt = new Date().toISOString();
      const expectation = overrides?.expectation;

      if (outcome === "expired") {
        return { hash, family, network, status: "expired", providerUrl, polledAt };
      }

      if (outcome === "replaced") {
        return { hash, family, network, status: "replaced", providerUrl, polledAt };
      }

      if (outcome === "failed") {
        return { hash, family, network, status: "failed", providerUrl, polledAt, revertReason: "Simulated revert reason (fixture coverage)." };
      }

      if (outcome === "pending") {
        return { hash, family, network, status: "pending", providerUrl, polledAt };
      }

      if (simulator || outcome) {
        const blockNumber = BigInt(1);
        const gasUsed = BigInt(21_000);
        const effectiveGasPrice = BigInt(1_000_000_000);
        const receipt = { status: "success", contractAddress: null, logs: [] } as const;
        const transaction = { from: expectation?.walletAddress, to: null as string | null, input: "0x" } as const;
        const verification = verifyReceiptEffects(transaction, receipt, expectation);

        return {
          hash,
          family,
          network,
          status: "confirmed",
          providerUrl,
          polledAt,
          blockNumber,
          blockHash: "0x0000000000000000000000000000000000000000000000000000000000000001" as Hash,
          gasUsed,
          effectiveGasPrice,
          fromAddress: transaction.from,
          toAddress: transaction.to ?? undefined,
          matchedEffects: verification.matched,
          verificationDetail: verification.detail,
        };
      }

      // No simulator: defer to the real provider. If the provider responds, perform
      // effects/wallet verification using the supplied expectation.
      try {
        await assertChainIdMatches(options);
        const client = createEvmPublicClient(options);
        if (!client) {
          return { hash, family, network, status: "pending", providerUrl, polledAt };
        }
        const [transaction, receipt] = await Promise.all([
          client.getTransaction({ hash }).catch(() => undefined),
          client.getTransactionReceipt({ hash }).catch(() => undefined),
        ]);

        if (!receipt) {
          return { hash, family, network, status: "pending", providerUrl, polledAt };
        }

        const verification = verifyReceiptEffects(
          transaction ? { from: transaction.from, to: transaction.to ?? null, input: transaction.input } : undefined,
          receipt ? { status: receipt.status, contractAddress: receipt.contractAddress ?? null, logs: receipt.logs as ReadonlyArray<{ address?: string; topics?: ReadonlyArray<string | null | undefined>; data?: string }> } : undefined,
          expectation,
        );

        if (!verification.matched) {
          return {
            hash,
            family,
            network,
            status: "failed",
            providerUrl,
            polledAt,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            revertReason: verification.detail ?? "Effect verification failed.",
            fromAddress: transaction?.from,
            toAddress: transaction?.to ?? receipt.contractAddress ?? undefined,
          };
        }

        if (receipt.status !== "success") {
          return {
            hash,
            family,
            network,
            status: "failed",
            providerUrl,
            polledAt,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            revertReason: `Receipt status: ${receipt.status}`,
          };
        }

        return {
          hash,
          family,
          network,
          status: "confirmed",
          providerUrl,
          polledAt,
          blockNumber: receipt.blockNumber,
          blockHash: receipt.blockHash,
          gasUsed: receipt.gasUsed,
          effectiveGasPrice: receipt.effectiveGasPrice,
          contractAddress: receipt.contractAddress ?? undefined,
          fromAddress: transaction?.from,
          toAddress: transaction?.to ?? receipt.contractAddress ?? undefined,
          matchedEffects: true,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "EVM RPC polling failed.";
        // Transient errors (timeout, connection refused, etc.) must not produce
        // an immutable terminal "failed" — return "pending" so the lifecycle
        // manager can retry later.
        const isTransient = /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|network|fetch.*fail|abort/i.test(message);
        return {
          hash,
          family,
          network,
          status: isTransient ? "pending" : "failed",
          providerUrl,
          polledAt,
          revertReason: message,
        };
      }
    },
  };
}
