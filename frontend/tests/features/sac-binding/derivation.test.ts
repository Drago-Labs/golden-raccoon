import { describe, expect, it } from "vitest";
import { deriveSacContractId, parseClassicAsset } from "@/server/research/sac-binding";
import { LONG_ASSET, USDC_ASSET } from "./fixtures";

describe("deriveSacContractId", () => {
  it("derives deterministic SAC contract IDs for native, 4-char, and 12-char assets on testnet and mainnet", () => {
    const nativeTestnet = deriveSacContractId(parseClassicAsset("native"), "stellar-testnet");
    const nativeMainnet = deriveSacContractId(parseClassicAsset("native"), "stellar-mainnet");
    expect(nativeTestnet.expectedContractId).toMatch(/^C[A-Z2-7]{55}$/);
    expect(nativeMainnet.expectedContractId).toMatch(/^C[A-Z2-7]{55}$/);
    expect(nativeTestnet.expectedContractId).not.toBe(nativeMainnet.expectedContractId);

    const alpha4Testnet = deriveSacContractId(parseClassicAsset(USDC_ASSET), "stellar-testnet");
    const alpha12Mainnet = deriveSacContractId(parseClassicAsset(LONG_ASSET), "stellar-mainnet");
    expect(alpha4Testnet.expectedContractId).toMatch(/^C[A-Z2-7]{55}$/);
    expect(alpha12Mainnet.expectedContractId).toMatch(/^C[A-Z2-7]{55}$/);
    expect(alpha4Testnet.steps).toHaveLength(3);
  });
});
