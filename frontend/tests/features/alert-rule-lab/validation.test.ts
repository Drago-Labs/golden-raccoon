import { describe, expect, it } from "vitest"; import { labRequestSchema } from "@/server/research/alert-rule-lab"; import { observation, request } from "./fixtures";
describe("rule lab validation", () => {
  it("rejects cross-wallet and cross-network observations", () => { expect(labRequestSchema.safeParse(request([observation("wallet", 80, 0, { walletAddress: "other" })])).success).toBe(false); expect(labRequestSchema.safeParse(request([observation("network", 80, 0, { network: "stellar-testnet" })])).success).toBe(false); });
  it("rejects windows over 100 observations", () => expect(labRequestSchema.safeParse(request(Array.from({ length: 101 }, (_, index) => observation(String(index), index, index)))).success).toBe(false));
});
