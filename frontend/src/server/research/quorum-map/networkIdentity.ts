export type StellarNetwork = "stellar-testnet" | "stellar-pubnet";

const DIRECTORY: Record<StellarNetwork, string> = {
  "stellar-pubnet": "https://api.stellarbeat.io/v1",
  "stellar-testnet": "https://api.stellarbeat.io/v1/testnet",
};

/** Directory host for the selected network. Pubnet never receives the testnet path. */
export function validatorDirectoryUrl(network: StellarNetwork): string {
  return DIRECTORY[network];
}

export function tomlUrl(homeDomain: string): string {
  return `https://${homeDomain}/.well-known/stellar.toml`;
}
