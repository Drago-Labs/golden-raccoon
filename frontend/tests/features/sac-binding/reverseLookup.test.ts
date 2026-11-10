import { describe, expect, it } from "vitest";
import { resolveCounterpartAsset, type ContractInstanceSnapshot } from "@/server/research/sac-binding";
import genuineSac from "./data/genuine-sac.json";

describe("resolveCounterpartAsset", () => {
  it("resolves the classic asset from a contract instance when only contractId is supplied", () => {
    const instance = genuineSac as unknown as ContractInstanceSnapshot;
    const asset = resolveCounterpartAsset(undefined, instance);
    expect(asset).not.toBeNull();
    expect(asset!.code).toBe("USDC");
  });
});
