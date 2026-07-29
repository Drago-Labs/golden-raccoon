import { StrKey } from "@stellar/stellar-sdk";
import { isAddress as isEvmAddress } from "viem";

export type ChainFamily = "evm" | "stellar";

export type StellarAddressKind = "account" | "contract" | "muxed_account";
export type WalletAddressKind = "evm_account" | "stellar_account";
export type ContractAddressKind = "evm_contract" | "soroban_contract";
export type AssetIdentityKind =
  | "evm_contract"
  | "stellar_native"
  | "stellar_classic"
  | "stellar_sac"
  | "stellar_sep41";

export type ChainContext = {
  chainFamily: ChainFamily;
  network: string;
};

export type WalletIdentity =
  | (ChainContext & { chainFamily: "evm"; kind: "evm_account"; address: string })
  | (ChainContext & { chainFamily: "stellar"; kind: "stellar_account"; address: string });

export type ContractIdentity =
  | (ChainContext & { chainFamily: "evm"; kind: "evm_contract"; address: string })
  | (ChainContext & { chainFamily: "stellar"; kind: "soroban_contract"; address: string });

export type AssetIdentity =
  | (ChainContext & {
      chainFamily: "evm";
      kind: "evm_contract";
      assetKey: string;
      contractAddress: string;
      symbol?: string;
    })
  | (ChainContext & {
      chainFamily: "stellar";
      kind: "stellar_native";
      assetKey: "native";
      symbol: "XLM";
    })
  | (ChainContext & {
      chainFamily: "stellar";
      kind: "stellar_classic";
      assetKey: string;
      code: string;
      issuer: string;
      symbol: string;
    })
  | (ChainContext & {
      chainFamily: "stellar";
      kind: "stellar_sac";
      assetKey: string;
      contractId: string;
      wrappedAssetKey?: string;
      symbol?: string;
    })
  | (ChainContext & {
      chainFamily: "stellar";
      kind: "stellar_sep41";
      assetKey: string;
      contractId: string;
      symbol?: string;
    });

export class ChainIdentityError extends Error {
  constructor(
    readonly code:
      | "invalid_network"
      | "invalid_wallet"
      | "invalid_contract"
      | "invalid_asset"
      | "invalid_transaction_hash"
      | "cross_family_identifier",
    message: string,
  ) {
    super(message);
    this.name = "ChainIdentityError";
  }
}

const safeNetworkPattern = /^[a-zA-Z0-9:_-]{1,64}$/;
const classicAssetCodePattern = /^[a-zA-Z0-9]{1,12}$/;
const evmTransactionHashPattern = /^0x[a-fA-F0-9]{64}$/;
const stellarTransactionHashPattern = /^[a-fA-F0-9]{64}$/;

const stellarNetworkAliases = new Map([
  ["stellar", "stellar-testnet"],
  ["testnet", "stellar-testnet"],
  ["stellar:testnet", "stellar-testnet"],
  ["stellar-testnet", "stellar-testnet"],
  ["pubnet", "stellar-pubnet"],
  ["stellar:pubnet", "stellar-pubnet"],
  ["stellar-mainnet", "stellar-pubnet"],
  ["stellar-pubnet", "stellar-pubnet"],
]);

export function getChainFamily(chain?: string): ChainFamily {
  const normalized = chain?.trim().toLowerCase() ?? "";

  return normalized === "stellar" || normalized.startsWith("stellar-") || normalized.startsWith("stellar:")
    ? "stellar"
    : "evm";
}

export function normalizeNetwork(network: string | undefined, family: ChainFamily) {
  const trimmed = network?.trim();

  if (!trimmed || trimmed.length > 64) {
    throw new ChainIdentityError("invalid_network", `A valid ${family} network is required.`);
  }

  const normalized = trimmed.toLowerCase().replace(/\s+/g, "-");

  if (!safeNetworkPattern.test(normalized)) {
    throw new ChainIdentityError("invalid_network", `A valid ${family} network is required.`);
  }

  if (family === "stellar") {
    const stellarNetwork = stellarNetworkAliases.get(normalized);

    if (!stellarNetwork) {
      throw new ChainIdentityError("invalid_network", `Unsupported Stellar network: ${trimmed}`);
    }

    return stellarNetwork;
  }

  if (stellarNetworkAliases.has(normalized) || normalized.startsWith("stellar")) {
    throw new ChainIdentityError("cross_family_identifier", "A Stellar network cannot be stored as an EVM network.");
  }

  return normalized;
}

export function resolveChainContext(input: {
  chainFamily?: ChainFamily;
  network?: string;
  chain?: string;
  identifier?: string;
}): ChainContext {
  const network = input.network ?? input.chain;
  const inferredFromNetwork = getChainFamily(network);
  const stellarIdentifier = isStellarAddress(input.identifier);
  const evmIdentifier = Boolean(input.identifier && isEvmAddress(input.identifier));
  const chainFamily =
    input.chainFamily ??
    (stellarIdentifier ? "stellar" : evmIdentifier ? "evm" : inferredFromNetwork);

  if (stellarIdentifier && chainFamily !== "stellar") {
    throw new ChainIdentityError("cross_family_identifier", "A Stellar identifier cannot be stored on an EVM record.");
  }

  if (evmIdentifier && chainFamily !== "evm") {
    throw new ChainIdentityError("cross_family_identifier", "An EVM identifier cannot be stored on a Stellar record.");
  }

  return {
    chainFamily,
    network: normalizeNetwork(network ?? (chainFamily === "evm" ? "legacy-evm" : undefined), chainFamily),
  };
}

export function getStellarAddressKind(value?: string): StellarAddressKind | null {
  const candidate = value?.trim() ?? "";

  if (StrKey.isValidEd25519PublicKey(candidate)) return "account";
  if (StrKey.isValidContract(candidate)) return "contract";
  if (StrKey.isValidMed25519PublicKey(candidate)) return "muxed_account";

  return null;
}

export function isStellarAccountAddress(value?: string) {
  return getStellarAddressKind(value) === "account";
}

export function isStellarContractAddress(value?: string) {
  return getStellarAddressKind(value) === "contract";
}

export function isStellarAddress(value?: string) {
  return getStellarAddressKind(value) !== null;
}

export function isWalletAddressForChain(value: string | undefined, chain?: string) {
  return getChainFamily(chain) === "stellar" ? isStellarAccountAddress(value) : Boolean(value && isEvmAddress(value));
}

export function isContractAddressForChain(value: string | undefined, chain?: string) {
  return getChainFamily(chain) === "stellar" ? isStellarContractAddress(value) : Boolean(value && isEvmAddress(value));
}

export function canonicalizeAddress(value: string, family: ChainFamily) {
  const trimmed = value.trim();

  return family === "evm" ? trimmed.toLowerCase() : trimmed;
}

export function isTransactionHashForChain(value: string, family: ChainFamily) {
  return family === "evm" ? evmTransactionHashPattern.test(value) : stellarTransactionHashPattern.test(value);
}

export function createWalletIdentity(input: ChainContext & { address: string }): WalletIdentity {
  const context = resolveChainContext({ ...input, identifier: input.address });
  const address = canonicalizeAddress(input.address, context.chainFamily);

  if (context.chainFamily === "evm") {
    if (!isEvmAddress(address)) {
      throw new ChainIdentityError("invalid_wallet", "Expected an EVM account address.");
    }

    return { chainFamily: "evm", network: context.network, kind: "evm_account", address };
  }

  if (!isStellarAccountAddress(address)) {
    throw new ChainIdentityError("invalid_wallet", "Expected a Stellar G-address account.");
  }

  return { chainFamily: "stellar", network: context.network, kind: "stellar_account", address };
}

export function createContractIdentity(input: ChainContext & { address: string }): ContractIdentity {
  const context = resolveChainContext({ ...input, identifier: input.address });
  const address = canonicalizeAddress(input.address, context.chainFamily);

  if (context.chainFamily === "evm") {
    if (!isEvmAddress(address)) {
      throw new ChainIdentityError("invalid_contract", "Expected an EVM contract address.");
    }

    return { chainFamily: "evm", network: context.network, kind: "evm_contract", address };
  }

  if (!isStellarContractAddress(address)) {
    throw new ChainIdentityError("invalid_contract", "Expected a Soroban C-address contract.");
  }

  return { chainFamily: "stellar", network: context.network, kind: "soroban_contract", address };
}

export function canonicalClassicAssetKey(code: string, issuer: string) {
  const canonicalCode = code.trim().toUpperCase();
  const canonicalIssuer = issuer.trim();

  if (!classicAssetCodePattern.test(canonicalCode) || !isStellarAccountAddress(canonicalIssuer)) {
    throw new ChainIdentityError("invalid_asset", "Classic Stellar assets require CODE:G... with a valid issuer.");
  }

  return `classic:${canonicalCode}:${canonicalIssuer}`;
}

export function createAssetIdentity(
  input:
    | (ChainContext & { kind: "evm_contract"; contractAddress: string; symbol?: string })
    | (ChainContext & { kind: "stellar_native" })
    | (ChainContext & { kind: "stellar_classic"; code: string; issuer: string })
    | (ChainContext & {
        kind: "stellar_sac";
        contractId: string;
        wrappedAssetKey?: string;
        symbol?: string;
      })
    | (ChainContext & { kind: "stellar_sep41"; contractId: string; symbol?: string }),
): AssetIdentity {
  const context = resolveChainContext({
    ...input,
    identifier:
      "contractAddress" in input
        ? input.contractAddress
        : "contractId" in input
          ? input.contractId
          : "issuer" in input
            ? input.issuer
            : undefined,
  });

  if (input.kind === "evm_contract") {
    if (context.chainFamily !== "evm") {
      throw new ChainIdentityError("cross_family_identifier", "EVM contract assets require an EVM network.");
    }
    const contract = createContractIdentity({ ...context, address: input.contractAddress });

    return {
      chainFamily: "evm",
      network: context.network,
      kind: "evm_contract",
      contractAddress: contract.address,
      assetKey: `contract:${contract.address}`,
      symbol: input.symbol?.trim().toUpperCase(),
    };
  }

  if (context.chainFamily !== "stellar") {
    throw new ChainIdentityError("cross_family_identifier", "Stellar assets require a Stellar network.");
  }

  if (input.kind === "stellar_native") {
    return {
      chainFamily: "stellar",
      network: context.network,
      kind: "stellar_native",
      assetKey: "native",
      symbol: "XLM",
    };
  }

  if (input.kind === "stellar_classic") {
    const assetKey = canonicalClassicAssetKey(input.code, input.issuer);

    return {
      chainFamily: "stellar",
      network: context.network,
      kind: "stellar_classic",
      assetKey,
      code: input.code.trim().toUpperCase(),
      issuer: input.issuer.trim(),
      symbol: input.code.trim().toUpperCase(),
    };
  }

  const contract = createContractIdentity({ ...context, address: input.contractId });
  const prefix = input.kind === "stellar_sac" ? "sac" : "sep41";

  return {
    chainFamily: "stellar",
    network: context.network,
    kind: input.kind,
    contractId: contract.address,
    assetKey: `${prefix}:${contract.address}`,
    ...("wrappedAssetKey" in input && input.wrappedAssetKey
      ? { wrappedAssetKey: input.wrappedAssetKey.trim() }
      : {}),
    symbol: input.symbol?.trim().toUpperCase(),
  } as AssetIdentity;
}

export function canonicalizeTransactionHash(hash: string, context: ChainContext) {
  const trimmed = hash.trim();

  if (!isTransactionHashForChain(trimmed, context.chainFamily)) {
    throw new ChainIdentityError(
      trimmed.startsWith("0x") !== (context.chainFamily === "evm")
        ? "cross_family_identifier"
        : "invalid_transaction_hash",
      `Transaction hash does not match ${context.chainFamily}/${context.network}.`,
    );
  }

  return context.chainFamily === "evm" ? trimmed.toLowerCase() : trimmed;
}

export function sameChainAddress(
  left: { chainFamily: ChainFamily; network: string; address: string },
  right: { chainFamily: ChainFamily; network: string; address: string },
) {
  if (left.chainFamily !== right.chainFamily) return false;
  if (normalizeNetwork(left.network, left.chainFamily) !== normalizeNetwork(right.network, right.chainFamily)) {
    return false;
  }

  return canonicalizeAddress(left.address, left.chainFamily) === canonicalizeAddress(right.address, right.chainFamily);
}
