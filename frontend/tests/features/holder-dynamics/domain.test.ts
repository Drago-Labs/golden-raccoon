import { describe, expect, it } from "vitest";
import { analyzeHolderDynamics, chainKey } from "@/server/research/holder-dynamics";
import { concentratedReader, missingReader, reorgReader, token, truncatedReader } from "./fixtures";

describe("holder dynamics", () => {
  it("reports concentration without treating partial lists as total coverage", async () => {
    const result = await analyzeHolderDynamics({ network: "ethereum", tokenAddress: token, fromBlock: 100, toBlock: 110 }, concentratedReader());
    expect(result.state).toBe("complete");
    expect(result.topHolderShareBps).toBe(9000);
    expect(result.holders[0]?.key).toBe(chainKey("ethereum", "0x0000000000000000000000000000000000000001"));
    expect(result.movements.some((movement) => movement.kind === "mint")).toBe(true);
  });

  it("keeps truncated and missing states explicit", async () => {
    const truncated = await analyzeHolderDynamics({ network: "ethereum", tokenAddress: token, fromBlock: 100, toBlock: 110 }, truncatedReader());
    expect(truncated.state).toBe("truncated");
    expect(truncated.warnings.join(" ")).toMatch(/truncated/i);
    const missing = await analyzeHolderDynamics({ network: "ethereum", tokenAddress: token, fromBlock: 100, toBlock: 110 }, missingReader());
    expect(missing.state).toBe("unavailable");
  });

  it("marks reorged windows as non-comparable", async () => {
    const result = await analyzeHolderDynamics({ network: "ethereum", tokenAddress: token, fromBlock: 100, toBlock: 110 }, reorgReader());
    expect(result.state).toBe("non_comparable");
    expect(result.movements).toEqual([]);
  });

  it("scopes addresses to network", async () => {
    const result = await analyzeHolderDynamics({ network: "ethereum", tokenAddress: token, fromBlock: 100, toBlock: 110 }, concentratedReader());
    expect(result.holders.every((holder) => holder.key.startsWith("ethereum:"))).toBe(true);
  });
});
