/**
 * What each provider last saw, and how far back it still retains history.
 *
 * An unavailable provider is labelled as unavailable. Its latest ledger stays
 * null rather than being copied from the other provider.
 */
import type { ProviderState } from "./errors";
import type { HorizonObservation, NetworkId, ProviderStatus, RpcObservation } from "./schema";

function retentionDetail(start: number | null, end: number | null, latest: number | null): string {
  const latestText = latest == null ? "Latest ledger was not reported." : `Latest ledger is ${latest}.`;

  if (start == null || end == null) {
    return `${latestText} Retention window was not reported.`;
  }

  if (end < start) {
    return `${latestText} Reported retention ${start}–${end} is inverted.`;
  }

  return `${latestText} Retention window is ledgers ${start}–${end}.`;
}

function fromObservation(
  observation: HorizonObservation | RpcObservation,
  network: NetworkId,
): ProviderStatus {
  const name = observation.provider === "horizon" ? "Horizon" : "Stellar RPC";

  return {
    provider: observation.provider,
    availability: "available",
    label: name,
    latestLedger: observation.latestLedger,
    retentionStartLedger: observation.retentionStartLedger,
    retentionEndLedger: observation.retentionEndLedger,
    network,
    endpoint: observation.endpoint,
    detail: retentionDetail(observation.retentionStartLedger, observation.retentionEndLedger, observation.latestLedger),
  };
}

function missing(provider: "horizon" | "rpc", network: NetworkId, endpoint: string, message: string): ProviderStatus {
  const name = provider === "horizon" ? "Horizon" : "Stellar RPC";

  return {
    provider,
    availability: "unavailable",
    label: `${name} unavailable`,
    latestLedger: null,
    retentionStartLedger: null,
    retentionEndLedger: null,
    network,
    endpoint,
    detail: message,
  };
}

export function providerStatuses(input: {
  network: NetworkId;
  horizonEndpoint: string;
  rpcEndpoint: string;
  horizon: ProviderState<HorizonObservation>;
  rpc: ProviderState<RpcObservation>;
}): ProviderStatus[] {
  const horizon =
    input.horizon.status === "available"
      ? fromObservation(input.horizon.observation, input.network)
      : missing("horizon", input.network, input.horizonEndpoint, input.horizon.message);

  const rpc =
    input.rpc.status === "available"
      ? fromObservation(input.rpc.observation, input.network)
      : missing("rpc", input.network, input.rpcEndpoint, input.rpc.message);

  return [horizon, rpc];
}
