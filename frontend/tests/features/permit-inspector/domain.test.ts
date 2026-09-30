import { describe, expect, it } from "vitest";
import { inspectPermit, type PermitRpc } from "@/server/research/permit-inspector";
import { nonEip2612Token, owner, permitReader, spender, token, wallet } from "./fixtures";

const base = { walletAddress: wallet, network: "ethereum", walletNetwork: "ethereum" } as const;

describe("permit inspector", () => {
  it("confirms EIP-2612 support only when both domain separator and nonce resolve", async () => {
    const reader = permitReader({ eip2612: { name: "Example Token", version: "1", domainSeparator: "0x" + "ab".repeat(32), nonce: 3n } });
    const result = await inspectPermit({ ...base, tokenAddress: token, ownerAddress: owner }, { rpc: reader });
    expect(result.eip2612).toMatchObject({ supported: true, name: "Example Token", version: "1", nonce: "3" });
    expect(result.chainId).toBe(1);
  });

  it("never guesses EIP-2612 support from a DOMAIN_SEPARATOR alone", async () => {
    const reader: PermitRpc = {
      async blockNumber() {
        return 100n;
      },
      async call(to, data) {
        // DOMAIN_SEPARATOR() resolves (some tokens use EIP-712 for other
        // purposes), but nonces(owner) reverts — this is not permit-capable.
        if (data === "0x3644e515") return "0x" + "cd".repeat(32);
        return null;
      },
    };
    const result = await inspectPermit({ ...base, tokenAddress: nonEip2612Token, ownerAddress: owner }, { rpc: reader });
    expect(result.eip2612?.supported).toBe(false);
    expect(result.eip2612?.domainSeparator).toBeNull();
    expect(result.warnings.some((w) => /not treated as EIP-2612/.test(w))).toBe(true);
  });

  it("checks Permit2 independently of EIP-2612 support when a spender is supplied", async () => {
    const reader = permitReader({ permit2: { amount: 500n, expiration: 4_000_000_000, nonce: 2 } });
    const result = await inspectPermit({ ...base, tokenAddress: nonEip2612Token, ownerAddress: owner, spenderAddress: spender }, { rpc: reader });
    expect(result.eip2612?.supported).toBe(false);
    expect(result.permit2).toMatchObject({ checked: true, amount: "500", expiration: 4_000_000_000, nonce: 2 });
  });

  it("does not check Permit2 when no spender is supplied, and says so", async () => {
    const reader = permitReader({});
    const result = await inspectPermit({ ...base, tokenAddress: nonEip2612Token, ownerAddress: owner }, { rpc: reader });
    expect(result.permit2).toBeNull();
    expect(result.warnings.some((w) => /Permit2 exposure.*not checked/.test(w))).toBe(true);
  });

  it("keeps two reads of the same token at different blocks independent (e.g. after a proxy upgrade)", async () => {
    const before = permitReader({ eip2612: { name: "Old Name", domainSeparator: "0x" + "11".repeat(32), nonce: 1n } });
    const after = permitReader({ eip2612: { name: "New Name", domainSeparator: "0x" + "22".repeat(32), nonce: 1n } });
    const resultBefore = await inspectPermit({ ...base, tokenAddress: token, ownerAddress: owner, blockNumber: 100 }, { rpc: before });
    const resultAfter = await inspectPermit({ ...base, tokenAddress: token, ownerAddress: owner, blockNumber: 200 }, { rpc: after });
    expect(resultBefore.eip2612?.name).toBe("Old Name");
    expect(resultAfter.eip2612?.name).toBe("New Name");
    expect(resultBefore.blockNumber).toBe(100);
    expect(resultAfter.blockNumber).toBe(200);
  });

  it("keeps a provider failure distinguishable from an unsupported token", async () => {
    const reader: PermitRpc = {
      async blockNumber() {
        throw new Error("RPC down");
      },
      async call() {
        return null;
      },
    };
    const result = await inspectPermit({ ...base, tokenAddress: token, ownerAddress: owner }, { rpc: reader });
    expect(result.state).toBe("unavailable");
    expect(result.blockNumber).toBeNull();
    expect(result.eip2612).toBeNull();
  });
});
