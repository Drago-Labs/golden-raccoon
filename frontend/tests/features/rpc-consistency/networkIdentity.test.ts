import { describe, expect, it } from "vitest";
import { RpcConsistencyError } from "@/server/research/rpc-consistency/errors";
import {
  assertObservedPassphrase,
  assertProviderEndpoint,
  MAINNET_IDENTITY,
  resolveNetworkIdentity,
  TESTNET_IDENTITY,
} from "@/server/research/rpc-consistency/networkIdentity";

describe("network identity", () => {
  it("keeps testnet and mainnet on different hosts", () => {
    expect(TESTNET_IDENTITY.horizonUrl).not.toBe(MAINNET_IDENTITY.horizonUrl);
    expect(TESTNET_IDENTITY.rpcUrl).not.toBe(MAINNET_IDENTITY.rpcUrl);
    expect(TESTNET_IDENTITY.passphrase).not.toBe(MAINNET_IDENTITY.passphrase);
    expect(resolveNetworkIdentity("testnet").id).toBe("testnet");
    expect(resolveNetworkIdentity("mainnet").id).toBe("mainnet");
  });

  it("rejects any other network name", () => {
    expect(() => resolveNetworkIdentity("futurenet")).toThrow(RpcConsistencyError);
    expect(() => resolveNetworkIdentity("stellar")).toThrow(/testnet or mainnet/);
  });

  it("stops when the passphrase belongs to the other network", () => {
    expect(() => assertObservedPassphrase(TESTNET_IDENTITY, MAINNET_IDENTITY.passphrase)).toThrow(/mainnet/);
    expect(() => assertObservedPassphrase(TESTNET_IDENTITY, null)).not.toThrow();
    expect(() => assertObservedPassphrase(TESTNET_IDENTITY, TESTNET_IDENTITY.passphrase)).not.toThrow();
  });

  it("stops when the endpoint host belongs to the other network", () => {
    expect(() => assertProviderEndpoint(TESTNET_IDENTITY, "horizon", MAINNET_IDENTITY.horizonUrl)).toThrow(RpcConsistencyError);
    expect(() => assertProviderEndpoint(MAINNET_IDENTITY, "rpc", MAINNET_IDENTITY.rpcUrl)).not.toThrow();
  });
});
