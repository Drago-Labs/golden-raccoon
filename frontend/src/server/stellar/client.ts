import { Horizon, rpc } from "@stellar/stellar-sdk";
import {
  assertStellarNetworkConfig,
  getStellarDataApiUrls,
  getStellarNetwork,
  getStellarRpcUrls,
  type StellarNetworkConfig,
} from "@/lib/stellar/config";
import { executeWithFallback } from "@/lib/stellar/failover";
import {
  StellarRpcDataLayer,
  type StellarDataLayerOptions,
} from "@/server/stellar/dataLayer";

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

export function createStellarRpcDataLayer(
  value?: string,
  options: StellarDataLayerOptions = {},
) {
  return new StellarRpcDataLayer(requireStellarNetwork(value).id, options);
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
  const network = requireStellarNetwork(value);
  const report = await new StellarRpcDataLayer(network.id).getHealth();
  const preferred = report.providers.find((provider) => provider.healthy);
  return {
    healthy: report.healthy,
    requestId: report.requestId,
    status: report.healthy ? "healthy" : "degraded",
    network: network.id,
    passphrase: preferred?.passphrase,
    protocolVersion: preferred?.protocolVersion,
    latestLedger: report.highestObservedLedger,
    checkedAt: report.checkedAt,
    latencyMs: Math.max(0, ...report.providers.map((provider) => provider.latencyMs)),
    providerUrl: preferred?.providerUrl,
    fallbackUsed: preferred
      ? report.providers.findIndex(
          (provider) => provider.providerUrl === preferred.providerUrl,
        ) > 0
      : false,
    providerDisagreement: report.providerDisagreement,
    providers: report.providers,
  };
}
