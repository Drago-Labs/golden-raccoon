/**
 * Testnet and mainnet stay separate.
 *
 * A comparison names one network and only talks to that network's Horizon and
 * RPC. A passphrase belonging to the other network aborts the check. There is
 * no fallback from testnet to mainnet, and no shared endpoint list.
 */
import { RpcConsistencyError } from "./errors";
import type { NetworkId } from "./schema";

export type NetworkIdentity = {
  id: NetworkId;
  passphrase: string;
  horizonUrl: string;
  rpcUrl: string;
};

export const TESTNET_IDENTITY: NetworkIdentity = {
  id: "testnet",
  passphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  rpcUrl: "https://soroban-testnet.stellar.org",
};

export const MAINNET_IDENTITY: NetworkIdentity = {
  id: "mainnet",
  passphrase: "Public Global Stellar Network ; September 2015",
  horizonUrl: "https://horizon.stellar.org",
  rpcUrl: "https://mainnet.sorobanrpc.com",
};

const IDENTITIES: Record<NetworkId, NetworkIdentity> = {
  testnet: TESTNET_IDENTITY,
  mainnet: MAINNET_IDENTITY,
};

export function identityFor(id: NetworkId): NetworkIdentity {
  return IDENTITIES[id];
}

export function resolveNetworkIdentity(value: string): NetworkIdentity {
  const normalized = value.trim().toLowerCase();

  if (normalized === "testnet") return TESTNET_IDENTITY;
  if (normalized === "mainnet") return MAINNET_IDENTITY;

  throw new RpcConsistencyError(
    "invalid_network",
    "Name the network as testnet or mainnet. The two are never compared together.",
  );
}

/**
 * Missing passphrase is not evidence of the other network.
 * A known foreign passphrase, or any unexpected one, is a mismatch.
 */
/** The endpoint host must be the one published for this provider on this network. */
export function assertProviderEndpoint(
  identity: NetworkIdentity,
  provider: "horizon" | "rpc",
  endpoint: string,
): void {
  let actual: URL;
  let expected: URL;

  try {
    actual = new URL(endpoint);
    expected = new URL(provider === "horizon" ? identity.horizonUrl : identity.rpcUrl);
  } catch {
    throw new RpcConsistencyError("network_mismatch", `The ${provider} endpoint is not a valid URL for ${identity.id}.`);
  }

  if (actual.host !== expected.host) {
    throw new RpcConsistencyError(
      "network_mismatch",
      `${provider} endpoint ${actual.host} is not the ${identity.id} host ${expected.host}.`,
    );
  }
}

export function assertObservedPassphrase(identity: NetworkIdentity, observed: string | null | undefined): void {
  if (observed == null || observed.trim() === "") return;

  if (observed === identity.passphrase) return;

  const other = identity.id === "testnet" ? MAINNET_IDENTITY : TESTNET_IDENTITY;
  const which = observed === other.passphrase ? other.id : "an unknown network";

  throw new RpcConsistencyError(
    "network_mismatch",
    `The provider answered for ${which} while the request asked for ${identity.id}.`,
  );
}
