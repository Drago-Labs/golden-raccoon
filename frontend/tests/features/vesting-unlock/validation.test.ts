import { describe, expect, it } from "vitest";
import { vestingUnlockRequestSchema } from "@/server/research/vesting-unlock/schema";

describe("vesting unlock request validation", () => {
  it("rejects empty sources and oversized payloads", () => {
    expect(
      vestingUnlockRequestSchema.safeParse({
        network: "ethereum",
        chainFamily: "evm",
        sources: [],
      }).success,
    ).toBe(false);

    expect(
      vestingUnlockRequestSchema.safeParse({
        network: "ethereum",
        chainFamily: "evm",
        sources: Array.from({ length: 21 }, (_, index) => ({
          kind: "evm_vesting_contract",
          id: `0x${index}`,
          network: "ethereum",
        })),
      }).success,
    ).toBe(false);
  });

  it("rejects source network mismatch and cross-family contracts", () => {
    expect(
      vestingUnlockRequestSchema.safeParse({
        network: "ethereum",
        chainFamily: "evm",
        sources: [{ kind: "evm_vesting_contract", id: "0x1", network: "base" }],
      }).success,
    ).toBe(false);

    expect(
      vestingUnlockRequestSchema.safeParse({
        network: "ethereum",
        chainFamily: "evm",
        sources: [{ kind: "stellar_vesting_contract", id: "C1", network: "ethereum" }],
      }).success,
    ).toBe(false);

    expect(
      vestingUnlockRequestSchema.safeParse({
        network: "stellar-testnet",
        chainFamily: "stellar",
        sources: [{ kind: "evm_vesting_contract", id: "0x1", network: "stellar-testnet" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a bounded valid request", () => {
    const parsed = vestingUnlockRequestSchema.safeParse({
      network: "ethereum",
      chainFamily: "evm",
      displayTimeZone: "Europe/Istanbul",
      sources: [{ kind: "issuer_published", id: "team-2026", network: "ethereum" }],
    });

    expect(parsed.success).toBe(true);
  });
});
