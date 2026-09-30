import { describe, expect, it } from "vitest";
import { oracleRequestSchema } from "@/server/research/oracle-divergence";
import { baseRequest } from "./fixtures";

describe("oracle divergence request validation", () => {
  it("accepts a well-formed request", () => {
    expect(oracleRequestSchema.safeParse(baseRequest()).success).toBe(true);
  });

  it("rejects a non-integer raw answer and a non-decimal quote price", () => {
    expect(oracleRequestSchema.safeParse(baseRequest({ rounds: [{ feedId: "chainlink-eth-usd", roundId: "1", rawAnswer: "1.5", updatedAt: "2026-01-01T00:00:00Z" }] })).success).toBe(false);
    expect(oracleRequestSchema.safeParse(baseRequest({ quotes: [{ pairId: "eth-usd", price: "not-a-number", sourceLabel: "x", observedAt: "2026-01-01T00:00:00Z" }] })).success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    expect(oracleRequestSchema.safeParse(baseRequest({ windowStart: "yesterday" })).success).toBe(false);
  });

  it("defaults staleAfterSeconds when omitted", () => {
    const parsed = oracleRequestSchema.safeParse(baseRequest({ staleAfterSeconds: undefined }));
    expect(parsed.success && parsed.data.staleAfterSeconds).toBe(3_600);
  });
});
