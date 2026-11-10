import { ResourceHeadroomError } from "./errors";

export const SUPPORTED_HEADROOM_NETWORKS = ["stellar-testnet", "stellar-mainnet"] as const;
export type HeadroomNetwork = (typeof SUPPORTED_HEADROOM_NETWORKS)[number];

export function isSupportedHeadroomNetwork(value: string): value is HeadroomNetwork {
  return (SUPPORTED_HEADROOM_NETWORKS as readonly string[]).includes(value);
}

export function assertSameLimitNetwork(expected: HeadroomNetwork, actual: HeadroomNetwork): void {
  if (expected !== actual) {
    throw new ResourceHeadroomError(
      `Network limits belonged to ${actual} instead of ${expected}`,
      "network_mismatch",
      false,
    );
  }
}
