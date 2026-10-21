/**
 * Which Stellar network a window belongs to.
 *
 * The passphrase is the identity. A public-network ledger must not be
 * explained as testnet, even when the sequence numbers happen to overlap.
 */
import { Networks } from "@stellar/stellar-sdk";
import { NetworkCongestionError } from "./errors";
import type { NetworkRef } from "./schema";

const PUBLIC_ALIASES = new Set(["stellar-pubnet", "stellar:pubnet", "stellar-mainnet", "pubnet", "public", "mainnet"]);
const TESTNET_ALIASES = new Set(["stellar-testnet", "stellar:testnet", "testnet", "stellar"]);

const PUBLIC_NETWORK: NetworkRef = {
  id: "stellar-pubnet",
  passphrase: Networks.PUBLIC,
  caip2: "stellar:pubnet",
};

const TESTNET_NETWORK: NetworkRef = {
  id: "stellar-testnet",
  passphrase: Networks.TESTNET,
  caip2: "stellar:testnet",
};

export function identifyNetwork(value: string): NetworkRef {
  const normalized = value.trim().toLowerCase();

  if (PUBLIC_ALIASES.has(normalized)) return PUBLIC_NETWORK;
  if (TESTNET_ALIASES.has(normalized)) return TESTNET_NETWORK;

  throw new NetworkCongestionError("unknown_network", `No Stellar network is named ${value.trim() || "(empty)"}.`);
}

export function assertPassphrase(network: NetworkRef, passphrase: string): void {
  if (passphrase !== network.passphrase) {
    throw new NetworkCongestionError(
      "passphrase_mismatch",
      `The ledger read reported a different network passphrase than ${network.id}.`,
    );
  }
}
