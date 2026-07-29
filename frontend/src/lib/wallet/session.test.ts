import { describe, expect, it } from "vitest";
import {
  getStellarMismatchMessage,
  parseRestoredStellarSession,
  shortenWalletAddress,
  stellarAdapterKind,
} from "@/lib/wallet/session";

describe("wallet session helpers", () => {
  it("rejects malformed or cross-family restored state", () => {
    expect(parseRestoredStellarSession(null)).toBeNull();
    expect(parseRestoredStellarSession("{broken")).toBeNull();
    expect(parseRestoredStellarSession(JSON.stringify({
      version: 1,
      walletId: "metamask",
      walletName: "MetaMask",
      adapter: "evm",
      address: "0x1234",
      network: "eip155:1",
    }))).toBeNull();
  });

  it("accepts only namespaced Stellar display state", () => {
    const restored = {
      version: 1 as const,
      walletId: "freighter",
      walletName: "Freighter",
      adapter: "freighter" as const,
      address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      network: "stellar-testnet" as const,
    };

    expect(parseRestoredStellarSession(JSON.stringify(restored))).toEqual(restored);
  });

  it("classifies stable adapters and produces a recovery message", () => {
    expect(stellarAdapterKind("freighter")).toBe("freighter");
    expect(stellarAdapterKind("wallet_connect")).toBe("walletconnect");
    expect(stellarAdapterKind("lobstr")).toBe("wallets-kit");
    expect(getStellarMismatchMessage("stellar-pubnet", "stellar-testnet")).toContain("switch it to stellar-testnet");
    expect(getStellarMismatchMessage("stellar-testnet", "stellar-testnet")).toBeNull();
    expect(shortenWalletAddress("GAAAAAAAAAAAAAAAAAAAAAAAWHF")).toBe("GAAAAA...AWHF");
  });
});
