import { describe, expect, it } from "vitest";
import { domainInfo } from "@/server/research/cctp-transfers/domainMap";
import { checkEvmNonceUsed } from "@/server/research/cctp-transfers/evmDestination";
import { checkStellarNonceUsed } from "@/server/research/cctp-transfers/stellarDestination";
import { stubRpcFetch } from "./fixtures";

describe("checkEvmNonceUsed", () => {
  it("reports completed when usedNonces returns nonzero", async () => {
    const ethereum = domainInfo(0)!;
    const fetchImpl = stubRpcFetch({ ethCallResult: `0x${"0".repeat(63)}1` });
    const result = await checkEvmNonceUsed(ethereum, `0x${"a".repeat(64)}`, "testnet", fetchImpl);
    expect(result.state).toBe("completed");
    expect(result.nonceUsed).toBe(true);
  });

  it("reports pending when usedNonces returns zero", async () => {
    const ethereum = domainInfo(0)!;
    const fetchImpl = stubRpcFetch({ ethCallResult: `0x${"0".repeat(64)}` });
    const result = await checkEvmNonceUsed(ethereum, `0x${"a".repeat(64)}`, "testnet", fetchImpl);
    expect(result.state).toBe("pending");
    expect(result.nonceUsed).toBe(false);
  });

  it("reports unknown for a chain with no configured RPC", async () => {
    const unichain = domainInfo(10)!;
    const fetchImpl = stubRpcFetch({});
    const result = await checkEvmNonceUsed(unichain, `0x${"a".repeat(64)}`, "testnet", fetchImpl);
    expect(result.state).toBe("unknown");
  });
});

describe("checkStellarNonceUsed", () => {
  it("reports completed when the adapter says the nonce is used", async () => {
    const result = await checkStellarNonceUsed(`0x${"a".repeat(64)}`, "testnet", async () => ({ nonceUsed: true }));
    expect(result.state).toBe("completed");
    expect(result.destinationChain).toBe("Stellar");
  });

  it("reports pending when the adapter says the nonce is unused", async () => {
    const result = await checkStellarNonceUsed(`0x${"a".repeat(64)}`, "testnet", async () => ({ nonceUsed: false }));
    expect(result.state).toBe("pending");
  });

  it("reports unknown, not a false completion, when the adapter throws", async () => {
    const result = await checkStellarNonceUsed(`0x${"a".repeat(64)}`, "testnet", async () => {
      throw new Error("contract call reverted");
    });
    expect(result.state).toBe("unknown");
    expect(result.nonceUsed).toBeNull();
    expect(result.issues[0]).toMatch(/reverted/);
  });
});
