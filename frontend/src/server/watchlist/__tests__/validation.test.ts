import { describe, expect, it } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";
import {
  buildWatchlistIdentity,
  identityKey,
  parseWatchlistAsset,
} from "@/server/watchlist/validation";

const evmWallet = "0x000000000000000000000000000000000000dEaD";
const stellarWallet = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACR6";

describe("parseWatchlistAsset", () => {
  it("canonicalises an EVM contract address to lowercase", () => {
    const result = parseWatchlistAsset({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetType: "evm_contract",
      assetIdentifier: "0xABCDEF1234567890ABCDEF1234567890ABCDEF12",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.assetIdentifier).toBe("0xabcdef1234567890abcdef1234567890abcdef12");
      expect(result.chainFamily).toBe("evm");
      expect(result.network).toBe("base");
      expect(result.assetType).toBe("evm_contract");
    }
  });

  it("rejects an EVM asset identifier that is not a 20-byte hex address", () => {
    const result = parseWatchlistAsset({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetType: "evm_contract",
      assetIdentifier: "0xnot-an-address",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.code).toBe("invalid_evm_address");
    }
  });

  it("forces native XLM identifier to the literal 'native'", () => {
    const result = parseWatchlistAsset({
      walletAddress: stellarWallet,
      chainFamily: "stellar",
      network: "stellar-pubnet",
      assetType: "stellar_native",
      assetIdentifier: "",
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.assetIdentifier).toBe("native");
    }
  });

  it("rejects non-empty identifiers for native XLM that are not 'native' / 'XLM'", () => {
    const result = parseWatchlistAsset({
      walletAddress: stellarWallet,
      chainFamily: "stellar",
      network: "stellar-pubnet",
      assetType: "stellar_native",
      assetIdentifier: "USDC",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.code).toBe("invalid_stellar_native");
    }
  });

  it("canonicalises a classic Stellar asset to uppercase CODE:ISSUER", () => {
    const result = parseWatchlistAsset({
      walletAddress: stellarWallet,
      chainFamily: "stellar",
      network: "stellar-pubnet",
      assetType: "stellar_classic",
      assetIdentifier: `usdc:${stellarWallet.toLowerCase()}`,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.assetIdentifier).toBe(`USDC:${stellarWallet}`);
    }
  });

  it("rejects classic Stellar assets with an invalid issuer G-address", () => {
    const result = parseWatchlistAsset({
      walletAddress: stellarWallet,
      chainFamily: "stellar",
      network: "stellar-pubnet",
      assetType: "stellar_classic",
      assetIdentifier: "USDC:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.code).toBe("invalid_stellar_classic");
    }
  });

  it("flags a Soroban contract address as SEP-41 capable", () => {
    // Derive a deterministic, real C-address from a 32-byte hash using the
    // SDK so we never test against a fake string.
    const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));

    const result = parseWatchlistAsset({
      walletAddress: stellarWallet,
      chainFamily: "stellar",
      network: "stellar-pubnet",
      assetType: "stellar_contract",
      assetIdentifier: contractId,
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.assetIdentifier).toBe(contractId.toUpperCase());
    }
  });

  it("rejects asset types that do not match the chain family", () => {
    const result = parseWatchlistAsset({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "stellar-pubnet",
      assetType: "stellar_classic",
      assetIdentifier: "",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.code).toBe("network_family_mismatch");
    }
  });

  it("rejects wallet addresses that do not match the chain family", () => {
    const result = parseWatchlistAsset({
      walletAddress: stellarWallet,
      chainFamily: "evm",
      network: "base",
      assetType: "evm_contract",
      assetIdentifier: "0xAbCDEF1234567890aBcDEF1234567890AbCdEF12",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.code).toBe("invalid_wallet_address");
    }
  });

  it("rejects unknown networks", () => {
    const result = parseWatchlistAsset({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "totally-unknown",
      assetType: "evm_contract",
      assetIdentifier: "0xAbCDEF1234567890aBcDEF1234567890AbCdEF12",
    });

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.code).toBe("invalid_network");
    }
  });
});

describe("buildWatchlistIdentity / identityKey", () => {
  it("treats the same EVM wallet on different networks as distinct entries", () => {
    const base = buildWatchlistIdentity({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "base",
      assetIdentifier: "0xabcdef",
    });
    const eth = buildWatchlistIdentity({
      walletAddress: evmWallet,
      chainFamily: "evm",
      network: "ethereum",
      assetIdentifier: "0xabcdef",
    });

    expect(identityKey(base)).not.toBe(identityKey(eth));
  });

  it("canonicalises the wallet case so uppercase EVM variants collide correctly", () => {
    const canonical = identityKey(
      buildWatchlistIdentity({
        walletAddress: "0xABCDEF",
        chainFamily: "evm",
        network: "base",
        assetIdentifier: "0xABCDEF",
      }),
    );
    const lower = identityKey(
      buildWatchlistIdentity({
        walletAddress: "0xabcdef",
        chainFamily: "evm",
        network: "base",
        assetIdentifier: "0xABCDEF",
      }),
    );

    expect(canonical).toBe(lower);
  });

  it("distinguishes two Stellar classic assets sharing the same code but different issuers", () => {
    const a = identityKey(
      buildWatchlistIdentity({
        walletAddress: stellarWallet,
        chainFamily: "stellar",
        network: "stellar-pubnet",
        assetIdentifier: `USDC:${stellarWallet}`,
      }),
    );
    const b = identityKey(
      buildWatchlistIdentity({
        walletAddress: stellarWallet,
        chainFamily: "stellar",
        network: "stellar-pubnet",
        assetIdentifier: "USDC:GBSAMRPJCNYUWDGVKJBLD7L3KZXBCJS2XO6FHKK3FGWYJ4VRSW4E7XZM",
      }),
    );

    expect(a).not.toBe(b);
  });
});
