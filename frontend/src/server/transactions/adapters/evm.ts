import { createPublicClient, http, recoverTransactionAddress, type Hash, type PublicClient } from "viem";
import type { ChainFamily } from "@/lib/chainIdentity";
import { isTransactionHashForChain } from "@/lib/chainIdentity";

export type EvmTerminalStatus = "confirmed" | "failed" | "replaced" | "expired" | "pending" | "submitted";

export type EvmVerificationExpectation = {
  walletAddress?: string;
  expectedEffects?: Array<{
    kind: "transfer" | "swap" | "approval" | "contract_call" | "publish_risk";
    fromAddress?: string;
    toAddress?: string;
    contractAddress?: string;
    method?: string;
  }>;
};

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
  const fromEnv = options.network === "goat"
    ? process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL
    : undefined;
  return options.rpcUrl ?? fromEnv ?? process.env.GOAT_RPC_URL ?? process.env.NEXT_PUBLIC_GOAT_RPC_URL ?? "https://rpc.goat.network";
}

export function createEvmPublicClient(options: EvmAdapterOptions): PublicClient | null {
  const rpcUrl = getEvmRpcUrl(options);

  return createPublicClient({
    transport: http(rpcUrl, { batch: true, timeout: 8_000 }),
    chain: undefined,
  });
}

export async function deriveEvmTransactionHash(signedPayload: string): Promise<Hash> {
  const trimmed = signedPayload.trim();

  if (isTransactionHashForChain(trimmed, "evm")) {
    return trimmed as Hash;
  }

  if (!/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    throw new Error("EVM signed payload must be a 0x-prefixed hex string.");
  }

  // For non-hash raw payloads, require a parseable signature.
  await recoverTransactionAddress({ serializedTransaction: trimmed as never }).catch(() => {
    throw new Error("Could not parse the signed EVM transaction (missing or invalid signature).");
  });

  return trimmed as Hash;
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
    transaction: { from?: string; to?: string | null } | undefined,
    receipt: { status?: string; contractAddress?: string | null } | undefined,
    expectation: EvmVerificationExpectation | undefined,
  ) {
    if (!expectation) return { matched: true, detail: undefined as string | undefined };

    if (expectation.walletAddress && transaction?.from) {
      if (transaction.from.toLowerCase() !== expectation.walletAddress.toLowerCase()) {
        return { matched: false, detail: `on-chain sender ${transaction.from} does not match expected wallet ${expectation.walletAddress}` };
      }
    }

    const effects = expectation.expectedEffects ?? [];
    for (const effect of effects) {
      if (effect.fromAddress && transaction?.from && transaction.from.toLowerCase() !== effect.fromAddress.toLowerCase()) {
        return { matched: false, detail: `${effect.kind} expected fromAddress ${effect.fromAddress}, observed ${transaction.from}` };
      }
      if (effect.toAddress) {
        const observedTo = transaction?.to ?? receipt?.contractAddress ?? null;
        if (!observedTo || (typeof observedTo === "string" && observedTo.toLowerCase() !== effect.toAddress.toLowerCase())) {
          return { matched: false, detail: `${effect.kind} expected toAddress ${effect.toAddress}` };
        }
      }
      if (effect.contractAddress && receipt?.contractAddress && receipt.contractAddress.toLowerCase() !== effect.contractAddress.toLowerCase()) {
        return { matched: false, detail: `${effect.kind} expected contractAddress ${effect.contractAddress}, observed ${receipt.contractAddress}` };
      }
    }

    return { matched: true, detail: undefined as string | undefined };
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
      const hash = trimmed.startsWith("0x") && isTransactionHashForChain(trimmed, "evm")
        ? (trimmed as Hash)
        : await deriveEvmTransactionHash(payload);

      // When no simulator is configured and the payload is a real signed raw transaction,
      // attempt to broadcast through the configured RPC provider. Hashes already in canonical
      // form bypass this and are treated as submitted externally.
      const isPreHash = isTransactionHashForChain(trimmed, "evm");
      if (!simulator && !outcome && !isPreHash) {
        try {
          const client = createEvmPublicClient(options);
          if (client) {
            await client.sendRawTransaction({ serializedTransaction: trimmed as never });
          }
        } catch (error) {
          throw new Error(error instanceof Error ? `EVM RPC broadcast failed: ${error.message}` : "EVM RPC broadcast failed.");
        }
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
            : "EVM signed transaction submitted to provider RPC.",
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
        const receipt = { status: "success", contractAddress: null } as const;
        const transaction = { from: expectation?.walletAddress, to: null as string | null };
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
          transaction ? { from: transaction.from, to: transaction.to ?? null } : undefined,
          receipt ? { status: receipt.status, contractAddress: receipt.contractAddress ?? null } : undefined,
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
        return {
          hash,
          family,
          network,
          status: "failed",
          providerUrl,
          polledAt,
          revertReason: error instanceof Error ? error.message : "EVM RPC polling failed.",
        };
      }
    },
  };
}
