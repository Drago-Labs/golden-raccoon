import { BalanceReconciliationError } from "./errors";

export type StellarNetwork = "stellar-testnet" | "stellar-pubnet";

const PASSPHRASE: Record<StellarNetwork, string> = {
  "stellar-testnet": "Test SDF Network ; September 2015",
  "stellar-pubnet": "Public Global Stellar Network ; September 2015",
};

const HORIZON: Record<StellarNetwork, string> = {
  "stellar-testnet": "https://horizon-testnet.stellar.org",
  "stellar-pubnet": "https://horizon.stellar.org",
};

export function horizonBase(network: StellarNetwork): string {
  return HORIZON[network];
}

export function assertNetworkPassphrase(network: StellarNetwork, passphrase: string | undefined): void {
  if (passphrase === undefined) return;
  if (passphrase !== PASSPHRASE[network]) {
    throw new BalanceReconciliationError("invalid_request", "Network passphrase does not match the selected network.");
  }
}
