import { createHash } from "node:crypto";
import { TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import type { ChainFamily } from "@/lib/chainIdentity";
import { isTransactionHashForChain } from "@/lib/chainIdentity";
import { getStellarNetwork, type StellarNetworkConfig, type StellarNetworkId } from "@/lib/stellar/config";
import type { TransactionExpectedEffect } from "@/server/types";

export type StellarTerminalStatus = "confirmed" | "failed" | "replaced" | "expired" | "pending" | "submitted";

export type StellarVerificationExpectation = {
  walletAddress?: string;
  expectedEffects?: TransactionExpectedEffect[];
  sourceAccount?: string;
};

export type StellarSubmitResult = {
  hash: string;
  family: ChainFamily;
  network: StellarNetworkId;
  status: StellarTerminalStatus;
  providerUrl: string;
  broadcastAcceptedAt?: string;
  detail: string;
  errorResultXdr?: string;
  failureReason?: string;
};

export type StellarPollResult = {
  hash: string;
  family: ChainFamily;
  network: StellarNetworkId;
  status: StellarTerminalStatus;
  ledger?: number;
  createdAt?: string;
  envelopeXdr?: string;
  resultXdr?: string;
  revertReason?: string;
  providerUrl: string;
  polledAt: string;
  sourceAccount?: string;
  matchedEffects?: boolean;
  verificationDetail?: string;
};

export type StellarAdapterOptions = {
  network: string;
  rpcUrl?: string;
};

type StellarSimulatorConfig = {
  submitOutcome?: "submitted" | "rejected" | "expired" | "failed";
  pollOutcome?: "confirmed" | "failed" | "replaced" | "expired" | "pending";
  expectedEffects?: TransactionExpectedEffect[];
};

const STELLAR_SIMULATOR = new Map<string, StellarSimulatorConfig>();

export function configureStellarSimulator(family: ChainFamily, network: string, config: StellarSimulatorConfig) {
  if (family !== "stellar") return;
  STELLAR_SIMULATOR.set(`${family}:${network.toLowerCase()}`, config);
}

export function clearStellarSimulator() {
  STELLAR_SIMULATOR.clear();
}

function getStellarSimulator(family: ChainFamily, network: string) {
  return STELLAR_SIMULATOR.get(`${family}:${network.toLowerCase()}`);
}

function getStellarNetworkByName(network: string): StellarNetworkId {
  const normalized = network.trim().toLowerCase();
  if (normalized === "stellar-pubnet" || normalized === "pubnet" || normalized === "stellar-mainnet") return "stellar-pubnet";
  return "stellar-testnet";
}

function getStellarRpcUrl(network: StellarNetworkId, override?: string): string {
  if (override) return override;
  const config = getStellarNetwork(network);
  return config?.rpcUrls?.[0] ?? "https://soroban-testnet.stellar.org";
}

function computeSimulatedHash(payload: string, network: string) {
  return createHash("sha256").update(`${network}:${payload}`).digest("hex");
}

function isPreHashInput(payload: string) {
  return isTransactionHashForChain(payload, "stellar") || /^[a-fA-F0-9]{64}$/.test(payload);
}

type StellarRpcSendResponse = Awaited<ReturnType<rpc.Server["sendTransaction"]>>;
type StellarRpcGetResponse = Awaited<ReturnType<rpc.Server["getTransaction"]>>;

export function getStellarChainAdapter(options: StellarAdapterOptions): {
  family: ChainFamily;
  network: StellarNetworkId;
  deriveHash: (payload: string) => string;
  submit: (
    payload: string,
    overrides?: {
      simulate?: StellarSimulatorConfig["submitOutcome"];
      expectedEffects?: TransactionExpectedEffect[];
      sourceAccount?: string;
    },
  ) => Promise<StellarSubmitResult>;
  poll: (
    hash: string,
    overrides?: {
      simulate?: StellarSimulatorConfig["pollOutcome"];
      expectation?: StellarVerificationExpectation;
    },
  ) => Promise<StellarPollResult>;
} {
  const network = getStellarNetworkByName(options.network);
  const family: ChainFamily = "stellar";
  const providerUrl = getStellarRpcUrl(network, options.rpcUrl);

  function requireConfig(): StellarNetworkConfig {
    const config = getStellarNetwork(network);
    if (!config) throw new Error(`Unsupported Stellar network: ${options.network}`);
    return config;
  }

  function deriveLiveHash(payload: string, config: StellarNetworkConfig): string | undefined {
    if (isPreHashInput(payload)) {
      return computeSimulatedHash(payload, options.network);
    }
    try {
      const transaction = TransactionBuilder.fromXDR(payload, config.networkPassphrase);
      if ("innerTransaction" in transaction) {
        throw new Error("Fee-bump transactions are not accepted by the transaction lifecycle.");
      }
      return transaction.hash().toString("hex");
    } catch {
      return undefined;
    }
  }

  function performPreSubmitChecks(payload: string, config: StellarNetworkConfig, expectation: StellarVerificationExpectation | undefined) {
    const transaction = TransactionBuilder.fromXDR(payload, config.networkPassphrase);
    if ("innerTransaction" in transaction) {
      throw new Error("Fee-bump transactions are not accepted by the transaction lifecycle.");
    }
    if (expectation?.sourceAccount && transaction.source !== expectation.sourceAccount) {
      throw new Error(`Stellar transaction source ${transaction.source} does not match expected connected account ${expectation.sourceAccount}.`);
    }
    if (expectation?.expectedEffects?.some((effect) => effect.kind === "publish_risk")) {
      const operations = transaction.operations.map((operation) => operation.type);
      if (!operations.includes("invokeHostFunction")) {
        throw new Error("Stellar publish_risk expected an invokeHostFunction operation.");
      }
    }
    return transaction;
  }

  return {
    family,
    network,
    deriveHash(payload: string) {
      requireConfig();
      const simulator = getStellarSimulator(family, options.network);
      if (simulator || isPreHashInput(payload)) {
        return computeSimulatedHash(payload, options.network);
      }
      const transaction = TransactionBuilder.fromXDR(payload, requireConfig().networkPassphrase);
      return transaction.hash().toString("hex");
    },
    async submit(payload, overrides) {
      const config = requireConfig();
      const simulator = getStellarSimulator(family, options.network);
      const outcome = overrides?.simulate ?? simulator?.submitOutcome;
      const expectation: StellarVerificationExpectation = {
        sourceAccount: overrides?.sourceAccount,
        expectedEffects: overrides?.expectedEffects,
      };
      const useSimulatedHash = Boolean(simulator) || isPreHashInput(payload);

      const transactionHash = useSimulatedHash
        ? computeSimulatedHash(payload, options.network)
        : (() => {
            try {
              const transaction = performPreSubmitChecks(payload, config, expectation);
              return transaction.hash().toString("hex");
            } catch (error) {
              throw new Error(error instanceof Error ? error.message : "Stellar XDR could not be parsed for the configured network passphrase.");
            }
          })();

      if (outcome === "rejected") {
        throw new Error("Stellar RPC rejected the transaction (bad sequence or insufficient fee).");
      }
      if (outcome === "expired") {
        throw new Error("Stellar RPC submission expired (stale ledger or sequence number).");
      }
      if (outcome === "failed") {
        throw new Error("Stellar RPC reported a fatal provider error.");
      }

      const submitted = !simulator && !outcome && !useSimulatedHash
        ? await safeSendTransaction(payload, config.networkPassphrase, providerUrl).catch(() => undefined)
        : undefined;

      if (!simulator && !outcome && !useSimulatedHash && !submitted) {
        throw new Error("Stellar RPC refused the transaction (broadcast did not return a response).");
      }

      return {
        hash: transactionHash,
        family,
        network,
        status: "submitted",
        providerUrl,
        broadcastAcceptedAt: submitted?.broadcastAt ?? new Date().toISOString(),
        detail: outcome
          ? `Simulated ${outcome} submit outcome for chain adapter tests.`
          : submitted
            ? "Stellar signed transaction submitted to RPC."
            : "Stellar transaction hash accepted as already broadcast (skip provider).",
        errorResultXdr: submitted?.errorResultXdr,
      };
    },
    async poll(hash, overrides) {
      const simulator = getStellarSimulator(family, options.network);
      const outcome = overrides?.simulate ?? simulator?.pollOutcome;
      const polledAt = new Date().toISOString();

      if (outcome === "expired") return { hash, family, network, status: "expired", providerUrl, polledAt };
      if (outcome === "replaced") return { hash, family, network, status: "replaced", providerUrl, polledAt };
      if (outcome === "failed") return { hash, family, network, status: "failed", providerUrl, polledAt, revertReason: "Simulated revert reason (fixture coverage)." };
      if (outcome === "pending") return { hash, family, network, status: "pending", providerUrl, polledAt };

      // Simulator is configured with an explicit outcome: honour it and skip the
      // real RPC so fixtures don't get clobbered by not-found responses.
      if (simulator) {
        return {
          hash,
          family,
          network,
          status: "confirmed",
          providerUrl,
          polledAt,
          ledger: 1,
          matchedEffects: undefined,
          verificationDetail: "Simulated on-chain confirmation (fixture coverage).",
        };
      }

      const real = await safeGetTransaction(hash, providerUrl).catch(() => undefined);
      if (!real) {
        return { hash, family, network, status: "pending", providerUrl, polledAt };
      }
      const mapped = mapStellarPollResponse(real, hash, family, network, providerUrl, polledAt);

      if (mapped.status === "pending") {
        return mapped;
      }

      const effectsCheck = verifyStellarEffects(real, overrides?.expectation);
      if (!effectsCheck.matched) {
        return {
          ...mapped,
          status: "failed",
          revertReason: effectsCheck.detail ?? mapped.revertReason ?? "Effect verification failed.",
          matchedEffects: false,
          verificationDetail: effectsCheck.detail,
        };
      }

      return { ...mapped, matchedEffects: effectsCheck.matched, verificationDetail: effectsCheck.detail };
    },
  };
}

async function safeSendTransaction(payload: string, networkPassphrase: string, providerUrl: string): Promise<{ broadcastAt: string; errorResultXdr?: string } | undefined> {
  let transaction;
  try {
    transaction = TransactionBuilder.fromXDR(payload, networkPassphrase);
    if ("innerTransaction" in transaction) return undefined;
  } catch {
    return undefined;
  }

  try {
    const server = new rpc.Server(providerUrl, { allowHttp: false, timeout: 8_000 });
    const raw = await server.sendTransaction(transaction).catch((error) => {
      throw error instanceof Error ? error : new Error("Unknown RPC error during sendTransaction");
    });
    const response = raw as StellarRpcSendResponse;
    const record = response as unknown as Record<string, unknown>;
    if (typeof record.hash === "string") {
      return { broadcastAt: new Date().toISOString() };
    }
    const errorResult = record.errorResult;
    if (errorResult && typeof (errorResult as { toString?: unknown }).toString === "function") {
      return { broadcastAt: new Date().toISOString(), errorResultXdr: (errorResult as { toString: (encoding: string) => string }).toString("base64") };
    }
    return { broadcastAt: new Date().toISOString() };
  } catch (error) {
    return undefined;
  }
}

async function safeGetTransaction(hash: string, providerUrl: string): Promise<StellarRpcGetResponse | undefined> {
  try {
    const server = new rpc.Server(providerUrl, { allowHttp: false, timeout: 8_000 });
    return (await server.getTransaction(hash)) as StellarRpcGetResponse;
  } catch {
    return undefined;
  }
}

function mapStellarPollResponse(response: StellarRpcGetResponse, hash: string, family: ChainFamily, network: StellarNetworkId, providerUrl: string, polledAt: string): StellarPollResult {
  const status = response.status;
  const record = response as unknown as Record<string, unknown>;
  const ledger = toLedgerNumber(record.ledger);
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : undefined;
  const resultXdr = typeof record.resultXdr === "string" ? record.resultXdr : undefined;
  const sourceAccount = typeof record.sourceAccount === "string" ? record.sourceAccount : undefined;

  if (status === "SUCCESS") {
    return { hash, family, network, status: "confirmed", providerUrl, polledAt, ledger, createdAt, resultXdr, sourceAccount };
  }

  if (status === "FAILED") {
    return { hash, family, network, status: "failed", providerUrl, polledAt, ledger, createdAt, resultXdr, revertReason: resultXdr };
  }

  return { hash, family, network, status: "pending", providerUrl, polledAt };
}

function toLedgerNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.length > 0 && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

function verifyStellarEffects(response: StellarRpcGetResponse, expectation: StellarVerificationExpectation | undefined) {
  if (!expectation) return { matched: true, detail: undefined as string | undefined };
  if (expectation.sourceAccount) {
    const sourceAccount = (response as unknown as Record<string, unknown>).sourceAccount;
    if (typeof sourceAccount === "string" && sourceAccount !== expectation.sourceAccount) {
      return { matched: false, detail: `Stellar sourceAccount ${sourceAccount} does not match expected ${expectation.sourceAccount}` };
    }
  }
  for (const effect of expectation.expectedEffects ?? []) {
    if (effect.kind === "publish_risk") {
      const operations = (response as unknown as Record<string, unknown>).operations as unknown;
      if (!Array.isArray(operations) || !operations.some((operation) => (operation as { type?: string }).type === "invokeHostFunction")) {
        return { matched: false, detail: `publish_risk expected invokeHostFunction effect, observed ${Array.isArray(operations) ? operations.map((o) => (o as { type?: string }).type) : "none"}` };
      }
    }
  }
  return { matched: true, detail: undefined as string | undefined };
}
