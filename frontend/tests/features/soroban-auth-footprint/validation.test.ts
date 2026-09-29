import { describe, expect, it } from "vitest";
import { AUTH_LIMITS, sorobanAuthRequestSchema } from "@/server/research/soroban-auth-footprint/schema";
import { nestedSimulation, wallet } from "./fixtures";

describe("soroban-auth-footprint validation", () => {
  it("rejects network mismatch and empty payloads", () => {
    expect(
      sorobanAuthRequestSchema.safeParse({
        walletAddress: wallet,
        network: "stellar-testnet",
        walletNetwork: "stellar-pubnet",
        simulationJson: nestedSimulation,
      }).success,
    ).toBe(false);
    expect(
      sorobanAuthRequestSchema.safeParse({
        walletAddress: wallet,
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
      }).success,
    ).toBe(false);
  });

  it("accepts bounded simulation JSON", () => {
    expect(
      sorobanAuthRequestSchema.safeParse({
        walletAddress: wallet,
        network: "stellar-testnet",
        walletNetwork: "stellar-testnet",
        simulationJson: nestedSimulation,
      }).success,
    ).toBe(true);
    expect(AUTH_LIMITS.maxPayloadChars).toBe(65_536);
  });
});
