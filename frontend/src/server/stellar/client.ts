import { Horizon, rpc } from "@stellar/stellar-sdk";
import {
  assertStellarNetworkConfig,
  getStellarDataApiUrls,
  getStellarNetwork,
  getStellarRpcUrls,
  type StellarNetworkConfig,
} from "@/lib/stellar/config";
import { executeWithFallback } from "@/lib/stellar/failover";

export type StellarProviderMeta = {
  provider: "stellar_rpc" | "stellar_data_api";
  network: string;
  checkedAt: string;
  latencyMs: number;
};

export function requireStellarNetwork(value?: string): StellarNetworkConfig {
  const network = getStellarNetwork(value);

  if (!network) {
    throw new Error(`Unsupported Stellar network: ${value ?? "missing"}`);
  }

  return assertStellarNetworkConfig(network);
}

function rpcServer(rpcUrl: string) {
  return new rpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://"),
    timeout: 12_000,
  });
}

export function createStellarRpcServer(value?: string, providerUrl?: string) {
  const network = requireStellarNetwork(value);
  const rpcUrl = providerUrl ?? getStellarRpcUrls(network)[0];

  return {
    network,
    providerUrl: rpcUrl,
    server: rpcServer(rpcUrl),
  };
}

export function createStellarRpcServers(value?: string) {
  const network = requireStellarNetwork(value);
  return getStellarRpcUrls(network).map((providerUrl) => ({ network, providerUrl, server: rpcServer(providerUrl) }));
}

export async function withStellarRpcFallback<T>(value: string | undefined, operation: (server: rpc.Server, providerUrl: string) => Promise<T>) {
  const network = requireStellarNetwork(value);
  const result = await executeWithFallback(getStellarRpcUrls(network), (providerUrl) => operation(rpcServer(providerUrl), providerUrl));
  return { network, ...result };
}

export function createStellarDataServer(value?: string) {
  const network = requireStellarNetwork(value);
  const dataApiUrl = getStellarDataApiUrls(network)[0];

  return {
    network,
    server: new Horizon.Server(dataApiUrl, {
      allowHttp: dataApiUrl.startsWith("http://"),
    }),
  };
}

export async function getStellarRpcHealth(value?: string) {
  const startedAt = performance.now();
  const result = await withStellarRpcFallback(value, async (server) => {
    const [health, rpcNetwork, latestLedger] = await Promise.all([server.getHealth(), server.getNetwork(), server.getLatestLedger()]);
    return { health, rpcNetwork, latestLedger };
  });
  const { network } = result;
  const { health, rpcNetwork, latestLedger } = result.value;
  const latencyMs = Math.round(performance.now() - startedAt);

  if (rpcNetwork.passphrase !== network.networkPassphrase) {
    throw new Error(`Stellar RPC passphrase mismatch for ${network.id}`);
  }

  return {
    healthy: health.status === "healthy",
    status: health.status,
    network: network.id,
    passphrase: rpcNetwork.passphrase,
    protocolVersion: rpcNetwork.protocolVersion,
    latestLedger: latestLedger.sequence,
    closeTime: latestLedger.closeTime,
    checkedAt: new Date().toISOString(),
    latencyMs,
    providerUrl: result.providerUrl,
    fallbackUsed: result.fallbackUsed,
    attempts: result.attempts,
  };
}
