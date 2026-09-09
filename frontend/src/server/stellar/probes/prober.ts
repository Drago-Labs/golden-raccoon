import { redactProviderUrl } from "@/lib/stellar/failover";
import type { StellarRpcTransport } from "@/server/stellar/dataLayer";

export type EndpointProbeResult = {
  endpointUrl: string;
  safeUrl: string;
  ok: boolean;
  latencyMs: number;
  timestamp: number;
  checkedAt: string;
  ledgerHeight?: number;
  passphrase?: string;
  protocolVersion?: string;
  healthStatus?: string;
  errorCode?: "timeout" | "network_mismatch" | "rpc_error" | "transport_error";
  error?: string;
};

export type ProbeOptions = {
  expectedPassphrase?: string;
  expectedProtocolVersion?: number;
  timeoutMs?: number;
  now?: () => number;
};

async function executeWithTimeout<T>(
  action: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([action(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Executes a synthetic health probe against an RPC endpoint.
 * Probes reachability, network identity, protocol version, and current ledger height.
 *
 * @param endpointUrl The RPC provider endpoint URL
 * @param transport StellarRpcTransport interface instance for this endpoint
 * @param options Validation parameters and probe timeout
 * @returns Standardized probe result with timing and status details
 */
export async function probeEndpoint(
  endpointUrl: string,
  transport: StellarRpcTransport,
  options: ProbeOptions = {},
): Promise<EndpointProbeResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const safeUrl = redactProviderUrl(endpointUrl);
  const timeoutMs = options.timeoutMs ?? 5_000;

  try {
    const [health, network, latestLedger] = await executeWithTimeout(
      () =>
        Promise.all([
          transport.getHealth(),
          transport.getNetwork(),
          transport.getLatestLedger(),
        ]),
      timeoutMs,
      safeUrl,
    );

    const latencyMs = Math.max(0, now() - startedAt);
    const checkedAt = new Date(startedAt).toISOString();
    const ledgerHeight = latestLedger?.sequence;
    const passphrase = network?.passphrase;
    const protocolVersion = network?.protocolVersion ? String(network.protocolVersion) : undefined;
    const healthStatus = health?.status;

    if (options.expectedPassphrase && passphrase !== options.expectedPassphrase) {
      return {
        endpointUrl,
        safeUrl,
        ok: false,
        latencyMs,
        timestamp: startedAt,
        checkedAt,
        ledgerHeight,
        passphrase,
        protocolVersion,
        healthStatus,
        errorCode: "network_mismatch",
        error: `${safeUrl} network passphrase mismatch (expected ${options.expectedPassphrase}, got ${passphrase}).`,
      };
    }

    if (
      options.expectedProtocolVersion !== undefined &&
      Number(protocolVersion) < options.expectedProtocolVersion
    ) {
      return {
        endpointUrl,
        safeUrl,
        ok: false,
        latencyMs,
        timestamp: startedAt,
        checkedAt,
        ledgerHeight,
        passphrase,
        protocolVersion,
        healthStatus,
        errorCode: "rpc_error",
        error: `${safeUrl} protocol version ${protocolVersion} is below required ${options.expectedProtocolVersion}.`,
      };
    }

    const isHealthy = healthStatus === "healthy";
    return {
      endpointUrl,
      safeUrl,
      ok: isHealthy,
      latencyMs,
      timestamp: startedAt,
      checkedAt,
      ledgerHeight,
      passphrase,
      protocolVersion,
      healthStatus,
      errorCode: isHealthy ? undefined : "rpc_error",
      error: isHealthy ? undefined : `${safeUrl} reported status ${healthStatus}.`,
    };
  } catch (error) {
    const latencyMs = Math.max(0, now() - startedAt);
    const checkedAt = new Date(startedAt).toISOString();
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout = message.toLowerCase().includes("timed out") || message.toLowerCase().includes("timeout");

    return {
      endpointUrl,
      safeUrl,
      ok: false,
      latencyMs,
      timestamp: startedAt,
      checkedAt,
      errorCode: isTimeout ? "timeout" : "transport_error",
      error: message.replaceAll(endpointUrl, safeUrl),
    };
  }
}
