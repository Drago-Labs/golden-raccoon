import { TxFailureDiagnosticsError } from "./errors";

export type StellarNetwork = "stellar-testnet" | "stellar-pubnet";

const PASSPHRASE: Record<StellarNetwork, string> = {
  "stellar-testnet": "Test SDF Network ; September 2015",
  "stellar-pubnet": "Public Global Stellar Network ; September 2015",
};

const HORIZON: Record<StellarNetwork, string> = {
  "stellar-testnet": "https://horizon-testnet.stellar.org",
  "stellar-pubnet": "https://horizon.stellar.org",
};

/** Horizon host for the selected network. A pubnet request never receives the testnet host. */
export function horizonBase(network: StellarNetwork): string {
  return HORIZON[network];
}

export function expectedPassphrase(network: StellarNetwork): string {
  return PASSPHRASE[network];
}

/**
 * Reject a passphrase that belongs to the other network.
 * An omitted passphrase is allowed: this feature never signs.
 */
export function assertNetworkPassphrase(network: StellarNetwork, passphrase: string | undefined): void {
  if (passphrase === undefined) return;

  if (passphrase !== PASSPHRASE[network]) {
    throw new TxFailureDiagnosticsError(
      "invalid_request",
      "Network passphrase does not match the selected network.",
    );
  }
}
