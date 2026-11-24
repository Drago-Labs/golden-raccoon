export const DELEGATION_CHAINS = ["ethereum", "base", "optimism", "arbitrum"] as const;
export function supportedDelegationChain(value: string): boolean { return (DELEGATION_CHAINS as readonly string[]).includes(value); }
