import { describe, expect, it } from "vitest";
import { CanonicalTokenRegistry, resolveCanonicalTokenIdentity } from "@/server/identity/canonicalResolver";

const issuer = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB422";
const contract = "0x1111111111111111111111111111111111111111";

describe("canonical token identity resolver", () => {
  it("scopes EVM identities by normalized network and address", () => {
    const result = resolveCanonicalTokenIdentity({ chain: "ethereum", network: "ethereum", contractAddress: contract, symbol: "USDC", source: "rpc" });
    expect(result.status).toBe("resolved");
    expect(result.identityKey).toBe(`ethereum:evm:${contract}`);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("resolves Stellar classic assets using issuer and code", () => {
    const result = resolveCanonicalTokenIdentity({ chain: "stellar-testnet", assetKey: "USDC", issuer, source: "horizon" });
    expect(result.status).toBe("resolved");
    expect(result.identityKey).toContain(`stellar-testnet:stellar:classic:USDC:${issuer}`);
  });

  it("rejects mixed-script and zero-width labels until acknowledged", () => {
    const result = resolveCanonicalTokenIdentity({ chain: "ethereum", network: "ethereum", contractAddress: contract, symbol: "U\u0431DC\u200b", source: "directory" });
    expect(result.status).toBe("rejected");
    expect(result.warnings.join(" ")).toMatch(/writing systems|zero-width|homoglyph/);
    const acknowledged = resolveCanonicalTokenIdentity({ chain: "ethereum", network: "ethereum", contractAddress: contract, symbol: "U\u0431DC\u200b", source: "directory", warningAcknowledged: true });
    expect(acknowledged.status).toBe("resolved");
  });

  it("fails closed when candidate identities disagree and caches only resolved values", () => {
    const first = resolveCanonicalTokenIdentity({ chain: "ethereum", network: "ethereum", contractAddress: contract, source: "rpc", candidates: [{ chain: "ethereum", network: "ethereum", contractAddress: "0x2222222222222222222222222222222222222222", source: "dex" }] });
    expect(first.status).toBe("ambiguous");
    const registry = new CanonicalTokenRegistry();
    const resolved = registry.resolve({ chain: "ethereum", network: "ethereum", contractAddress: contract, source: "rpc" });
    expect(registry.resolve({ chain: "ethereum", network: "ethereum", contractAddress: contract, source: "rpc" })).toEqual(resolved);
  });
});
