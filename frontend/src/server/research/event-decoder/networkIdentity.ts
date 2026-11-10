export const SUPPORTED_EVENT_NETWORKS = ["stellar-testnet", "stellar-mainnet"] as const;
export type EventDecoderNetwork = (typeof SUPPORTED_EVENT_NETWORKS)[number];

export function isSupportedEventNetwork(value: string): value is EventDecoderNetwork {
  return (SUPPORTED_EVENT_NETWORKS as readonly string[]).includes(value);
}
