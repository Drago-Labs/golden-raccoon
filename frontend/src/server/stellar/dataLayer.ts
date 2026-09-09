import { randomUUID } from "node:crypto";
import {
  Address,
  Keypair,
  nativeToScVal,
  rpc,
  type FeeBumpTransaction,
  type Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import {
  getStellarNetwork,
  getStellarRpcUrls,
  type StellarNetworkConfig,
  type StellarNetworkId,
} from "@/lib/stellar/config";
import { redactProviderUrl } from "@/lib/stellar/failover";
import { sharedProviderCircuits } from "@/server/providers/adapter";
import {
  StellarDataLayerError,
  type StellarProviderAttempt,
  type StellarProviderErrorCode,
} from "./errors";
import {
  EndpointSelector,
  hedgedExecute,
  ProbeScheduler,
  RequestBudget,
  type EndpointHealthState,
} from "./transport";

export {
  StellarDataLayerError,
  type StellarProviderAttempt,
  type StellarProviderErrorCode,
};

export type StellarRpcTransport = Pick<
  rpc.Server,
  | "getEvents"
  | "getHealth"
  | "getLatestLedger"
  | "getLedgerEntries"
  | "getNetwork"
  | "getTransaction"
  | "sendTransaction"
  | "simulateTransaction"
>;

export type StellarRpcTransportFactory = (
  providerUrl: string,
  requestId: string,
) => StellarRpcTransport;

export type StellarProviderMetadata = {
  requestId: string;
  network: StellarNetworkId;
  providerUrl: string;
  fallbackUsed: boolean;
  checkedAt: string;
  freshnessMs: number;
  latencyMs: number;
  ledgerHeight?: number;
  highestObservedLedger?: number;
  ledgerLag?: number;
  providerDisagreement: boolean;
  attempts: StellarProviderAttempt[];
  reliability: number;
  confidence: number;
  hedged?: boolean;
};

export type StellarRpcResult<T> = {
  value: T;
  meta: StellarProviderMetadata;
};

export type StellarProviderHealth = {
  providerUrl: string;
  healthy: boolean;
  score?: number;
  state?: EndpointHealthState;
  passphrase?: string;
  protocolVersion?: string;
  ledgerHeight?: number;
  lag?: number;
  latencyMs: number;
  checkedAt: string;
  errorCode?: StellarProviderErrorCode;
  error?: string;
};

export type StellarHealthReport = {
  healthy: boolean;
  requestId: string;
  network: StellarNetworkId;
  checkedAt: string;
  highestObservedLedger?: number;
  providerDisagreement: boolean;
  outage?: {
    isOutage: boolean;
    reason?: string;
  };
  providers: StellarProviderHealth[];
};

type Probe = StellarProviderHealth & {
  transport: StellarRpcTransport;
};

export type StellarDataLayerOptions = {
  providerUrls?: readonly string[];
  transportFactory?: StellarRpcTransportFactory;
  timeoutMs?: number;
  totalBudgetMs?: number;
  retryLimit?: number;
  retryDelayMs?: number;
  maxLedgerLag?: number;
  enableHedging?: boolean;
  hedgeDelayMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type ExecuteOptions = {
  requestId?: string;
  retryLimit?: number;
  totalBudgetMs?: number;
  enableHedging?: boolean;
  hedgeDelayMs?: number;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_TOTAL_BUDGET_MS = 8_000;
const DEFAULT_MAX_LEDGER_LAG = 3;

function defaultTransportFactory(providerUrl: string, requestId: string) {
  return new rpc.Server(providerUrl, {
    allowHttp: providerUrl.startsWith("http://"),
    timeout: DEFAULT_TIMEOUT_MS,
    headers: { "x-request-id": requestId },
  });
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function classifyError(error: unknown): {
  code: StellarProviderErrorCode;
  retryable: boolean;
} {
  if (error instanceof StellarDataLayerError) {
    return { code: error.code, retryable: error.retryable };
  }

  const message = errorMessage(error).toLowerCase();
  if (message.includes("timeout") || message.includes("abort")) {
    return { code: "timeout", retryable: true };
  }
  if (
    message.includes("xdr") ||
    message.includes("bad union switch") ||
    message.includes("invalid scval")
  ) {
    return { code: "malformed_xdr", retryable: false };
  }
  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("econn") ||
    message.includes("socket")
  ) {
    return { code: "transport_error", retryable: true };
  }
  return { code: "rpc_error", retryable: false };
}

async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new StellarDataLayerError(
            "timeout",
            `${label} timed out after ${timeoutMs}ms`,
            true,
          ),
        ),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function boundedScore(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

/**
 * Cache helper that makes the network dimension mandatory. A testnet value
 * cannot be addressed through a pubnet key, even when the resource ID matches.
 */
export class StellarNetworkCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(network: StellarNetworkId, key: string): T | undefined {
    const cacheKey = `${network}:${key}`;
    const item = this.values.get(cacheKey);
    if (!item) return undefined;
    if (item.expiresAt <= this.now()) {
      this.values.delete(cacheKey);
      return undefined;
    }
    return item.value;
  }

  set(network: StellarNetworkId, key: string, value: T) {
    this.values.set(`${network}:${key}`, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
  }
}

export function buildAccountLedgerKey(accountId: string) {
  let account: Keypair;
  try {
    account = Keypair.fromPublicKey(accountId);
  } catch {
    throw new StellarDataLayerError(
      "invalid_request",
      "A valid Stellar account ID is required.",
      false,
    );
  }

  return xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({
      accountId: account.xdrAccountId(),
    }),
  );
}

export function buildContractDataLedgerKey(
  contractId: string,
  key: xdr.ScVal | unknown,
  durability: "persistent" | "temporary" = "persistent",
) {
  let contract: xdr.ScAddress;
  try {
    const address = Address.fromString(contractId);
    if (address.type !== "contract") throw new Error("not a contract");
    contract = address.toScAddress();
  } catch {
    throw new StellarDataLayerError(
      "invalid_request",
      "A valid Stellar contract ID is required.",
      false,
    );
  }

  const persistentVal =
    typeof xdr.ContractDataDurability.persistent === "function"
      ? (xdr.ContractDataDurability.persistent as unknown as () => xdr.ContractDataDurability)()
      : xdr.ContractDataDurability.persistent;
  const temporaryVal =
    typeof xdr.ContractDataDurability.temporary === "function"
      ? (xdr.ContractDataDurability.temporary as unknown as () => xdr.ContractDataDurability)()
      : xdr.ContractDataDurability.temporary;

  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract,
      key: key instanceof xdr.ScVal ? key : nativeToScVal(key),
      durability: durability === "persistent" ? persistentVal : temporaryVal,
    }),
  );
}

export class StellarRpcDataLayer {
  readonly network: StellarNetworkConfig;
  private readonly providerUrls: readonly string[];
  private readonly transportFactory: StellarRpcTransportFactory;
  private readonly timeoutMs: number;
  private readonly totalBudgetMs: number;
  private readonly retryLimit: number;
  private readonly retryDelayMs: number;
  private readonly maxLedgerLag: number;
  private readonly enableHedging: boolean;
  private readonly hedgeDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly scheduler: ProbeScheduler;
  private readonly selector: EndpointSelector;

  constructor(networkId: StellarNetworkId, options: StellarDataLayerOptions = {}) {
    const network = getStellarNetwork(networkId);
    if (!network) {
      throw new StellarDataLayerError(
        "invalid_request",
        `Unsupported Stellar network: ${networkId}`,
        false,
      );
    }
    this.network = network;
    this.providerUrls = options.providerUrls ?? getStellarRpcUrls(network);
    this.transportFactory = options.transportFactory ?? defaultTransportFactory;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.totalBudgetMs = options.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS;
    this.retryLimit = Math.max(0, options.retryLimit ?? 1);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? 150);
    this.maxLedgerLag = Math.max(0, options.maxLedgerLag ?? DEFAULT_MAX_LEDGER_LAG);
    this.enableHedging = options.enableHedging ?? false;
    this.hedgeDelayMs = options.hedgeDelayMs ?? 150;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;

    if (this.providerUrls.length === 0) {
      throw new StellarDataLayerError(
        "invalid_request",
        `No RPC providers configured for ${networkId}.`,
        false,
      );
    }

    this.scheduler = new ProbeScheduler({
      endpoints: this.providerUrls,
      transportFactory: (url) => this.transportFactory(url, "probe"),
      expectedPassphrase: this.network.networkPassphrase,
      expectedProtocolVersion: this.network.expectedProtocolVersion,
      maxLag: this.maxLedgerLag,
      timeoutMs: this.timeoutMs,
      now: this.now,
    });
    this.selector = new EndpointSelector(this.scheduler);
  }

  getScheduler(): ProbeScheduler {
    return this.scheduler;
  }

  getSelector(): EndpointSelector {
    return this.selector;
  }

  private async probeProvider(
    providerUrl: string,
    requestId: string,
  ): Promise<Probe> {
    const startedAt = this.now();
    const checkedAt = new Date(startedAt).toISOString();
    const transport = this.transportFactory(providerUrl, requestId);
    const safeProviderUrl = redactProviderUrl(providerUrl);
    const circuitKey = `stellar-rpc:${this.network.id}:${safeProviderUrl}`;

    try {
      sharedProviderCircuits.acquire(circuitKey);
      const [health, network, latestLedger] = await withTimeout(
        () =>
          Promise.all([
            transport.getHealth(),
            transport.getNetwork(),
            transport.getLatestLedger(),
          ]),
        this.timeoutMs,
        `${providerUrl} health`,
      );
      const latencyMs = this.now() - startedAt;

      if (network.passphrase !== this.network.networkPassphrase) {
        sharedProviderCircuits.failure(circuitKey, latencyMs, false);
        return {
          transport,
          providerUrl: safeProviderUrl,
          healthy: false,
          passphrase: network.passphrase,
          protocolVersion: network.protocolVersion,
          ledgerHeight: latestLedger.sequence,
          latencyMs,
          checkedAt,
          errorCode: "network_mismatch",
          error: `${safeProviderUrl} serves a different Stellar network.`,
        };
      }
      if (
        Number(network.protocolVersion) < this.network.expectedProtocolVersion
      ) {
        sharedProviderCircuits.failure(circuitKey, latencyMs);
        return {
          transport,
          providerUrl: safeProviderUrl,
          healthy: false,
          passphrase: network.passphrase,
          protocolVersion: network.protocolVersion,
          ledgerHeight: latestLedger.sequence,
          latencyMs,
          checkedAt,
          errorCode: "rpc_error",
          error: `${safeProviderUrl} protocol ${network.protocolVersion} is below required ${this.network.expectedProtocolVersion}.`,
        };
      }

      if (health.status === "healthy") sharedProviderCircuits.success(circuitKey, latencyMs);
      else sharedProviderCircuits.failure(circuitKey, latencyMs);
      return {
        transport,
        providerUrl: safeProviderUrl,
        healthy: health.status === "healthy",
        passphrase: network.passphrase,
        protocolVersion: network.protocolVersion,
        ledgerHeight: latestLedger.sequence,
        latencyMs,
        checkedAt,
        error:
          health.status === "healthy"
            ? undefined
            : `${safeProviderUrl} reported ${health.status}.`,
        errorCode: health.status === "healthy" ? undefined : "rpc_error",
      };
    } catch (error) {
      const classified = classifyError(error);
      sharedProviderCircuits.failure(circuitKey, this.now() - startedAt, classified.retryable);
      return {
        transport,
        providerUrl: safeProviderUrl,
        healthy: false,
        latencyMs: this.now() - startedAt,
        checkedAt,
        errorCode: classified.code,
        error: errorMessage(error).replaceAll(providerUrl, safeProviderUrl),
      };
    }
  }

  private async probeProviders(requestId: string) {
    const probes = await Promise.all(
      this.providerUrls.map((url) => this.probeProvider(url, requestId)),
    );
    const heights = probes
      .map((probe) => probe.ledgerHeight)
      .filter((height): height is number => height !== undefined);
    const highestObservedLedger =
      heights.length > 0 ? Math.max(...heights) : undefined;

    const evaluated = probes.map((probe) => {
      const lag =
        highestObservedLedger !== undefined && probe.ledgerHeight !== undefined
          ? highestObservedLedger - probe.ledgerHeight
          : undefined;
      if (probe.healthy && lag !== undefined && lag > this.maxLedgerLag) {
        return {
          ...probe,
          lag,
          healthy: false,
          errorCode: "provider_lag" as const,
          error: `${probe.providerUrl} is ${lag} ledgers behind the freshest provider.`,
        };
      }
      return { ...probe, lag };
    });

    for (const probe of evaluated) {
      this.scheduler.recordOutcome(probe.providerUrl, {
        ok: probe.healthy,
        latencyMs: probe.latencyMs,
        ledgerHeight: probe.ledgerHeight,
        errorCode: probe.errorCode,
        error: probe.error,
      });
    }

    return evaluated;
  }

  async getHealth(
    requestId: string = randomUUID(),
  ): Promise<StellarHealthReport> {
    const providers = await this.probeProviders(requestId);
    const heights = providers
      .map((provider) => provider.ledgerHeight)
      .filter((height): height is number => height !== undefined);
    const highestObservedLedger =
      heights.length > 0 ? Math.max(...heights) : undefined;
    const providerDisagreement =
      new Set(heights).size > 1 ||
      providers.some(
        (provider) =>
          provider.errorCode === "network_mismatch" ||
          provider.errorCode === "provider_lag",
      );

    const outageStatus = this.selector.getOutageStatus();
    const states = this.scheduler.getAllStates();

    return {
      healthy: !outageStatus.isOutage && providers.length > 0 && providers.every((provider) => provider.healthy),
      requestId,
      network: this.network.id,
      checkedAt: new Date(this.now()).toISOString(),
      highestObservedLedger,
      providerDisagreement,
      outage: outageStatus.isOutage
        ? { isOutage: true, reason: outageStatus.reason }
        : undefined,
      providers: providers.map((provider) => {
        const state = states.find((s) => s.safeUrl === provider.providerUrl);
        return {
          providerUrl: provider.providerUrl,
          healthy: provider.healthy,
          score: state?.score,
          state: state?.state,
          passphrase: provider.passphrase,
          protocolVersion: provider.protocolVersion,
          ledgerHeight: provider.ledgerHeight,
          lag: provider.lag,
          latencyMs: provider.latencyMs,
          checkedAt: provider.checkedAt,
          errorCode: provider.errorCode,
          error: provider.error,
        };
      }),
    };
  }

  private async execute<T>(
    operation: (transport: StellarRpcTransport) => Promise<T>,
    options: ExecuteOptions = {},
  ): Promise<StellarRpcResult<T>> {
    const requestId = options.requestId ?? randomUUID();
    const requestStartedAt = this.now();
    const totalBudgetMs = options.totalBudgetMs ?? this.totalBudgetMs;
    const budget = new RequestBudget({
      totalBudgetMs,
      startedAt: requestStartedAt,
      now: this.now,
    });

    const probes = await this.probeProviders(requestId);
    const attempts: StellarProviderAttempt[] = probes
      .filter((probe) => !probe.healthy)
      .map((probe) => ({
        providerUrl: probe.providerUrl,
        stage: "health",
        attempt: 1,
        ok: false,
        latencyMs: probe.latencyMs,
        ledgerHeight: probe.ledgerHeight,
        errorCode: probe.errorCode,
        error: probe.error,
      }));
    const highestObservedLedger = probes.reduce<number | undefined>(
      (highest, probe) =>
        probe.ledgerHeight === undefined
          ? highest
          : Math.max(highest ?? probe.ledgerHeight, probe.ledgerHeight),
      undefined,
    );
    const providerDisagreement =
      new Set(
        probes
          .map((probe) => probe.ledgerHeight)
          .filter((height): height is number => height !== undefined),
      ).size > 1 || attempts.length > 0;
    const retries = Math.max(0, options.retryLimit ?? this.retryLimit);

    const healthyProbes = probes.filter((probe) => probe.healthy);

    if (healthyProbes.length === 0) {
      const outage = this.selector.getOutageStatus();
      throw new StellarDataLayerError(
        "all_providers_failed",
        outage.isOutage
          ? `Network-wide outage detected for ${this.network.id}: ${outage.reason}`
          : `All Stellar RPC providers failed for ${this.network.id}.`,
        false,
        attempts,
      );
    }

    const sortedProbes = [...healthyProbes].sort((a, b) => {
      const scoreA = this.scheduler.getState(a.providerUrl)?.score ?? 0;
      const scoreB = this.scheduler.getState(b.providerUrl)?.score ?? 0;
      return scoreB - scoreA;
    });

    const useHedging =
      (options.enableHedging ?? this.enableHedging) && sortedProbes.length >= 2;
    if (useHedging) {
      const primary = sortedProbes[0]!;
      const secondary = sortedProbes[1]!;
      const hedgeDelayMs = options.hedgeDelayMs ?? this.hedgeDelayMs;

      try {
        const hedgedResult = await hedgedExecute(
          primary.providerUrl,
          secondary.providerUrl,
          async (url) => {
            const transport = this.transportFactory(url, requestId);
            return operation(transport);
          },
          {
            hedgeDelayMs,
            budget,
            maxAttemptTimeoutMs: this.timeoutMs,
            now: this.now,
          },
        );

        const winnerUrl = redactProviderUrl(hedgedResult.winnerUrl);
        const winnerProbe =
          winnerUrl === primary.providerUrl ? primary : secondary;
        const fallbackUsed = winnerUrl !== this.providerUrls[0];
        const reliability = boundedScore(0.98 - (fallbackUsed ? 0.05 : 0));
        const confidence = boundedScore(
          reliability - (providerDisagreement ? 0.08 : 0),
        );

        attempts.push({
          providerUrl: winnerUrl,
          stage: "operation",
          attempt: 1,
          ok: true,
          latencyMs: hedgedResult.durationMs,
          ledgerHeight: winnerProbe.ledgerHeight,
        });

        return {
          value: hedgedResult.value,
          meta: {
            requestId,
            network: this.network.id,
            providerUrl: winnerUrl,
            fallbackUsed,
            checkedAt: winnerProbe.checkedAt,
            freshnessMs: Math.max(
              0,
              this.now() - new Date(winnerProbe.checkedAt).getTime(),
            ),
            latencyMs: this.now() - requestStartedAt,
            ledgerHeight: winnerProbe.ledgerHeight,
            highestObservedLedger,
            ledgerLag: winnerProbe.lag,
            providerDisagreement,
            attempts,
            reliability,
            confidence,
            hedged: hedgedResult.hedgedDispatched,
          },
        };
      } catch {
      }
    }

    for (const probe of sortedProbes) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        if (budget.remainingMs(this.now()) <= 0) {
          attempts.push({
            providerUrl: probe.providerUrl,
            stage: "operation",
            attempt: attempt + 1,
            ok: false,
            latencyMs: this.now() - requestStartedAt,
            ledgerHeight: probe.ledgerHeight,
            errorCode: "timeout",
            error: `Total request budget exhausted (${totalBudgetMs}ms).`,
          });
          break;
        }

        const attemptTimeoutMs = budget.allocateAttemptTimeout(this.timeoutMs);
        const startedAt = this.now();
        try {
          const value = await withTimeout(
            () => operation(probe.transport),
            attemptTimeoutMs,
            `${probe.providerUrl} operation`,
          );
          const latencyMs = this.now() - startedAt;
          this.scheduler.recordOutcome(probe.providerUrl, {
            ok: true,
            latencyMs,
            ledgerHeight: probe.ledgerHeight,
          });
          attempts.push({
            providerUrl: probe.providerUrl,
            stage: "operation",
            attempt: attempt + 1,
            ok: true,
            latencyMs,
            ledgerHeight: probe.ledgerHeight,
          });
          const failureCount = attempts.filter((item) => !item.ok).length;
          const fallbackUsed = probe.providerUrl !== this.providerUrls[0];
          const reliability = boundedScore(
            0.98 - failureCount * 0.16 - (fallbackUsed ? 0.1 : 0),
          );
          const confidence = boundedScore(
            reliability - (providerDisagreement ? 0.12 : 0),
          );

          return {
            value,
            meta: {
              requestId,
              network: this.network.id,
              providerUrl: probe.providerUrl,
              fallbackUsed,
              checkedAt: probe.checkedAt,
              freshnessMs: Math.max(
                0,
                this.now() - new Date(probe.checkedAt).getTime(),
              ),
              latencyMs: this.now() - requestStartedAt,
              ledgerHeight: probe.ledgerHeight,
              highestObservedLedger,
              ledgerLag: probe.lag,
              providerDisagreement,
              attempts,
              reliability,
              confidence,
            },
          };
        } catch (error) {
          const classified = classifyError(error);
          this.scheduler.recordOutcome(probe.providerUrl, {
            ok: false,
            latencyMs: this.now() - startedAt,
            errorCode: classified.code,
            error: errorMessage(error),
          });
          attempts.push({
            providerUrl: probe.providerUrl,
            stage: "operation",
            attempt: attempt + 1,
            ok: false,
            latencyMs: this.now() - startedAt,
            ledgerHeight: probe.ledgerHeight,
            errorCode: classified.code,
            error: errorMessage(error),
          });
          if (budget.remainingMs(this.now()) <= 0) break;
          if (!classified.retryable || attempt === retries) break;
          await this.sleep(this.retryDelayMs * (attempt + 1));
        }
      }
    }

    const retryableCodes = new Set<StellarProviderErrorCode>([
      "provider_lag",
      "timeout",
      "transport_error",
    ]);
    const failures = attempts.filter((attempt) => !attempt.ok);
    throw new StellarDataLayerError(
      "all_providers_failed",
      `All Stellar RPC providers failed for ${this.network.id}.`,
      failures.length > 0 &&
        failures.every(
          (attempt) =>
            attempt.errorCode !== undefined &&
            retryableCodes.has(attempt.errorCode),
        ),
      attempts,
    );
  }

  async getLedgerEntries(
    keys: readonly xdr.LedgerKey[],
    options: ExecuteOptions & { requireAll?: boolean } = {},
  ) {
    if (keys.length === 0) {
      throw new StellarDataLayerError(
        "invalid_request",
        "At least one SDK-built ledger key is required.",
        false,
      );
    }

    const result = await this.execute(
      (transport) => transport.getLedgerEntries(...keys),
      options,
    );
    if (options.requireAll !== false && result.value.entries.length !== keys.length) {
      throw new StellarDataLayerError(
        "missing_entry",
        `Requested ${keys.length} ledger entries but received ${result.value.entries.length}.`,
        false,
        result.meta.attempts,
      );
    }
    return result;
  }

  simulateTransaction(
    transaction: Transaction | FeeBumpTransaction,
    options: ExecuteOptions = {},
  ) {
    return this.execute(async (transport) => {
      const simulation = await transport.simulateTransaction(transaction);
      if ("error" in simulation) {
        throw new StellarDataLayerError(
          "simulation_failed",
          simulation.error,
          false,
        );
      }
      return simulation;
    }, options);
  }

  submitTransaction(
    transaction: Transaction | FeeBumpTransaction,
    options: ExecuteOptions = {},
  ) {
    return this.execute(async (transport) => {
      const submission = await transport.sendTransaction(transaction);
      if (submission.status === "ERROR") {
        throw new StellarDataLayerError(
          "submission_failed",
          `Stellar RPC rejected transaction ${submission.hash}.`,
          false,
        );
      }
      return submission;
    }, { ...options, retryLimit: 0 });
  }

  async pollTransaction(
    hash: string,
    options: ExecuteOptions & {
      attempts?: number;
      intervalMs?: number;
    } = {},
  ) {
    const attempts = Math.max(1, Math.min(30, options.attempts ?? 6));
    let latest:
      | Awaited<ReturnType<StellarRpcTransport["getTransaction"]>>
      | undefined;
    let latestMeta: StellarProviderMetadata | undefined;

    for (let index = 0; index < attempts; index += 1) {
      const result = await this.execute(
        (transport) => transport.getTransaction(hash),
        options,
      );
      latest = result.value;
      latestMeta = result.meta;
      if (latest.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) return result;
      if (index + 1 < attempts) {
        await this.sleep(Math.max(0, options.intervalMs ?? 1_000));
      }
    }

    return { value: latest!, meta: latestMeta! };
  }

  getEvents(
    request: rpc.Api.GetEventsRequest,
    options: ExecuteOptions = {},
  ) {
    return this.execute((transport) => transport.getEvents(request), options);
  }
}
