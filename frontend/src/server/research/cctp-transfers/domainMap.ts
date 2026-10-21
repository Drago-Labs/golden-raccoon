/**
 * CCTP domain IDs, chain metadata, and the fixed CCTP V2 contract
 * addresses this tool reads from.
 *
 * Domain IDs and the EVM V2 contract addresses are sourced from Circle's
 * published CCTP references (`cctp-supported-blockchains`,
 * `contract-addresses`) and were spot-checked against live chains before
 * use: `usedNonces(bytes32(0))` on the mainnet MessageTransmitterV2
 * address returns `1` (Circle's contract reserves that nonce at
 * construction), and both the mainnet and testnet addresses have
 * deployed bytecode. The Stellar testnet/mainnet contract IDs are from
 * Circle's `stellar-contracts` reference page.
 *
 * Only a subset of real CCTP domains has a configured RPC path in this
 * app: the EVM chains already present in `@/lib/evm/config` (which this
 * feature reuses rather than duplicating), plus Stellar. Every other real
 * domain is still named correctly here — an *unsupported* domain is never
 * confused with an *unknown* one; see `describeDomain`.
 */
import { StrKey } from "@stellar/stellar-sdk";
import { getEvmNetwork } from "@/lib/evm/config";

export type DomainKind = "evm" | "stellar" | "other";

export type DomainInfo = {
  domain: number;
  chainName: string;
  kind: DomainKind;
  /** Key into `@/lib/evm/config`'s network table, for chains this tool can reach on mainnet. */
  evmNetworkKey: string | null;
  /** A public testnet RPC endpoint for this chain, verified reachable before use. */
  testnetRpcUrl: string | null;
};

const DOMAINS: DomainInfo[] = [
  { domain: 0, chainName: "Ethereum", kind: "evm", evmNetworkKey: "ethereum", testnetRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com" },
  { domain: 1, chainName: "Avalanche", kind: "evm", evmNetworkKey: "avalanche", testnetRpcUrl: "https://avalanche-fuji-c-chain-rpc.publicnode.com" },
  { domain: 2, chainName: "OP Mainnet", kind: "evm", evmNetworkKey: "optimism", testnetRpcUrl: "https://optimism-sepolia-rpc.publicnode.com" },
  { domain: 3, chainName: "Arbitrum", kind: "evm", evmNetworkKey: "arbitrum", testnetRpcUrl: "https://arbitrum-sepolia-rpc.publicnode.com" },
  { domain: 4, chainName: "Noble", kind: "other", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 5, chainName: "Solana", kind: "other", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 6, chainName: "Base", kind: "evm", evmNetworkKey: "base", testnetRpcUrl: "https://base-sepolia-rpc.publicnode.com" },
  { domain: 7, chainName: "Polygon PoS", kind: "evm", evmNetworkKey: "polygon", testnetRpcUrl: "https://polygon-amoy-bor-rpc.publicnode.com" },
  { domain: 8, chainName: "Sui", kind: "other", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 9, chainName: "Aptos", kind: "other", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 10, chainName: "Unichain", kind: "evm", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 11, chainName: "Linea", kind: "evm", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 12, chainName: "Codex", kind: "evm", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 13, chainName: "Sonic", kind: "evm", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 14, chainName: "World Chain", kind: "evm", evmNetworkKey: null, testnetRpcUrl: null },
  { domain: 27, chainName: "Stellar", kind: "stellar", evmNetworkKey: null, testnetRpcUrl: "https://soroban-testnet.stellar.org" },
];

/** Same address on every CCTP V2 EVM mainnet; verified to have deployed bytecode. */
export const MESSAGE_TRANSMITTER_V2_MAINNET = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
export const MESSAGE_TRANSMITTER_V2_TESTNET = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
export const TOKEN_MESSENGER_V2_MAINNET = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
export const TOKEN_MESSENGER_V2_TESTNET = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

export const STELLAR_CCTP_CONTRACTS = {
  mainnet: {
    tokenMessengerMinter: "CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL",
    messageTransmitter: "CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV",
    cctpForwarder: "CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T",
  },
  testnet: {
    tokenMessengerMinter: "CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP",
    messageTransmitter: "CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY",
    cctpForwarder: "CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ",
  },
} as const;

export function domainInfo(domain: number): DomainInfo | null {
  return DOMAINS.find((entry) => entry.domain === domain) ?? null;
}

export function resolveSourceChain(name: string): DomainInfo | null {
  const normalized = name.trim().toLowerCase();
  return DOMAINS.find((entry) => entry.chainName.toLowerCase() === normalized) ?? null;
}

/** An unrecognized domain is shown raw, never mislabelled as a known chain. */
export function describeDomain(domain: number): string {
  return domainInfo(domain)?.chainName ?? `Unknown domain ${domain}`;
}

export function evmRpcIsConfigured(info: DomainInfo, network: "mainnet" | "testnet"): boolean {
  if (info.kind !== "evm") return false;
  return network === "mainnet" ? Boolean(info.evmNetworkKey && getEvmNetwork(info.evmNetworkKey)) : Boolean(info.testnetRpcUrl);
}

export function evmRpcUrlFor(info: DomainInfo, network: "mainnet" | "testnet"): string | null {
  if (network === "testnet") return info.testnetRpcUrl;
  if (!info.evmNetworkKey) return null;
  return getEvmNetwork(info.evmNetworkKey)?.rpcUrl ?? null;
}

/**
 * Renders a raw 32-byte CCTP address field in the form the destination
 * chain actually uses. EVM chains take the low 20 bytes; Stellar contract
 * IDs are the full 32 bytes StrKey-encoded. Anything else (Solana, Sui,
 * Aptos, Noble) is shown as the raw hex rather than guessed at.
 */
export function formatCrossChainAddress(info: DomainInfo | null, raw32Hex: string): string {
  const normalized = raw32Hex.startsWith("0x") ? raw32Hex.slice(2) : raw32Hex;
  if (normalized.length !== 64) return raw32Hex;

  if (info?.kind === "evm") {
    return `0x${normalized.slice(24)}`;
  }

  if (info?.kind === "stellar") {
    try {
      return StrKey.encodeContract(Buffer.from(normalized, "hex"));
    } catch {
      return raw32Hex;
    }
  }

  return raw32Hex;
}
