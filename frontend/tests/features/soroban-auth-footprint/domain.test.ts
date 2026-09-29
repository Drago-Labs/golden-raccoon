import { describe, expect, it } from "vitest";
import { inspectSorobanAuthFootprint, parseSimulationAuthTree } from "@/server/research/soroban-auth-footprint";
import { flaggedSimulation, nestedSimulation, wallet } from "./fixtures";

const request = {
  walletAddress: wallet,
  network: "stellar-testnet" as const,
  walletNetwork: "stellar-testnet" as const,
  simulationJson: nestedSimulation,
};

describe("soroban-auth-footprint domain", () => {
  it("displays nested invocation with parent and required address", async () => {
    const result = await inspectSorobanAuthFootprint(request);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]?.parentId).toBeNull();
    expect(result.nodes[1]?.parentId).toBe(result.nodes[0]?.id);
    expect(result.nodes[0]?.address).toBe(wallet);
    expect(result.decodingIsNotApproval).toBe(true);
  });

  it("rejects network/passphrase mismatch before decoding claims", async () => {
    const result = await inspectSorobanAuthFootprint({
      ...request,
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    });
    expect(result.state).toBe("unavailable");
    expect(result.nodes).toEqual([]);
  });

  it("bounds large or malformed payloads without crashing", async () => {
    const huge = await inspectSorobanAuthFootprint({
      ...request,
      simulationJson: "x".repeat(70_000),
    });
    expect(huge.state).toBe("unavailable");
    const malformed = await inspectSorobanAuthFootprint({
      ...request,
      simulationJson: "{not-json",
    });
    expect(malformed.state).toBe("unavailable");
    const badXdr = await inspectSorobanAuthFootprint({
      ...request,
      simulationJson: undefined,
      envelopeXdr: "%%%",
    });
    expect(badXdr.state).toBe("unavailable");
  });

  it("flags unknown fields, duplicates, expiry, and never greens unknown auth", () => {
    const { nodes } = parseSimulationAuthTree(flaggedSimulation, "Test SDF Network ; September 2015", 5);
    expect(nodes[0]?.flags).toEqual(
      expect.arrayContaining(["unknown_contract", "unsupported_scval", "network_mismatch", "expiring"]),
    );
    expect(nodes.some((node) => node.flags.includes("duplicate"))).toBe(true);
    expect(nodes.every((node) => node.note.toLowerCase().includes("never") || node.flags.length > 0)).toBe(true);
  });
});
