import { Asset, StrKey } from "@stellar/stellar-sdk";
import {
  canonicalClassicAssetKey as canonicalClassicKey,
  createAssetIdentity,
} from "@/lib/chainIdentity";
import { getStellarNetwork } from "@/lib/stellar/config";

export type StellarAssetIdentity =
  | {
      type: "native";
      assetKey: "native";
      symbol: "XLM";
      name: "Stellar Lumens";
      contractId: string;
    }
  | {
      type: "classic";
      assetKey: string;
      symbol: string;
      issuer: string;
      contractId: string;
    }
  | {
      type: "sac" | "sep41";
      assetKey: string;
      contractId: string;
      wrappedAssetKey?: string;
    }
  | {
      type: "issuer_account";
      assetKey: string;
      issuer: string;
    };

const assetCodePattern = /^[a-zA-Z0-9]{1,12}$/;

export function canonicalClassicAssetKey(code: string, issuer: string) {
  return canonicalClassicKey(code, issuer);
}

export function canonicalContractAssetKey(contractId: string, kind: "sac" | "sep41" = "sep41") {
  return `${kind}:${contractId.trim()}`;
}

export function parseStellarAssetInput(query: string, networkId: string): StellarAssetIdentity | null {
  const network = getStellarNetwork(networkId);
  if (!network) throw new Error(`Unsupported Stellar network: ${networkId}`);
  const trimmed = query.trim();

  if (["xlm", "native", "stellar:xlm"].includes(trimmed.toLowerCase())) {
    const identity = createAssetIdentity({
      chainFamily: "stellar",
      network: network.id,
      kind: "stellar_native",
    });
    if (identity.kind !== "stellar_native") throw new Error("Unexpected native asset identity.");

    return {
      type: "native",
      assetKey: identity.assetKey,
      symbol: identity.symbol,
      name: "Stellar Lumens",
      contractId: Asset.native().contractId(network.networkPassphrase),
    };
  }

  const prefixedContract = /^(sac|sep41):(.+)$/i.exec(trimmed);
  const contractKind = prefixedContract?.[1]?.toLowerCase() as "sac" | "sep41" | undefined;
  const contractCandidate = prefixedContract?.[2] ?? trimmed;

  if (StrKey.isValidContract(contractCandidate)) {
    const type = contractKind ?? "sep41";
    const identity = createAssetIdentity({
      chainFamily: "stellar",
      network: network.id,
      kind: type === "sac" ? "stellar_sac" : "stellar_sep41",
      contractId: contractCandidate,
    });
    if (identity.kind !== "stellar_sac" && identity.kind !== "stellar_sep41") {
      throw new Error("Unexpected Soroban token identity.");
    }

    return {
      type,
      assetKey: identity.assetKey,
      contractId: identity.contractId,
    };
  }

  if (StrKey.isValidEd25519PublicKey(trimmed)) {
    const issuer = trimmed;

    return {
      type: "issuer_account",
      assetKey: `issuer:${issuer}`,
      issuer,
    };
  }

  const separator = trimmed.indexOf(":");

  if (separator <= 0) return null;

  const code = trimmed.slice(0, separator).toUpperCase();
  const issuer = trimmed.slice(separator + 1);

  if (!assetCodePattern.test(code) || !StrKey.isValidEd25519PublicKey(issuer)) return null;

  const asset = new Asset(code, issuer);
  const identity = createAssetIdentity({
    chainFamily: "stellar",
    network: network.id,
    kind: "stellar_classic",
    code,
    issuer,
  });
  if (identity.kind !== "stellar_classic") throw new Error("Unexpected classic asset identity.");

  return {
    type: "classic",
    assetKey: identity.assetKey,
    symbol: identity.symbol,
    issuer: identity.issuer,
    contractId: asset.contractId(network.networkPassphrase),
  };
}
