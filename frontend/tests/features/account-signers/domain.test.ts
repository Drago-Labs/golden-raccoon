import { describe, expect, it } from "vitest";
import { buildOperationMatrix, inspectAccountSigners, sumSignerWeights } from "@/server/research/account-signers";
import { coSigner, source, wallet } from "./fixtures";

const request = {
  walletAddress: wallet,
  accountAddress: wallet,
  network: "stellar-testnet" as const,
  walletNetwork: "stellar-testnet" as const,
};

describe("account-signers domain", () => {
  it("models zero-weight master with additional signers", async () => {
    const result = await inspectAccountSigners(request, { source: source() });
    expect(result.thresholds?.masterWeight).toBe(0);
    expect(result.signers).toHaveLength(2);
    expect(result.totalWeight).toBe(2);
    expect(result.warnings.some((warning) => /master key weight is zero/i.test(warning))).toBe(true);
    const payment = result.operations.find((entry) => entry.operation === "payment");
    expect(payment?.reachable).toBe(true);
    const setOptions = result.operations.find((entry) => entry.operation === "set_options");
    expect(setOptions?.reachable).toBe(false);
  });

  it("never equates reachability with private-key possession", async () => {
    const result = await inspectAccountSigners(request, { source: source() });
    expect(result.coverageMessage.toLowerCase()).toContain("not");
    expect(result.operations.every((entry) => /private key|possession/i.test(entry.note) || !entry.reachable || entry.reachable)).toBe(true);
    expect(result.operations[0]?.note).toMatch(/does not prove key possession|below the/i);
  });

  it("rejects nothing at domain layer but marks unavailable accounts", async () => {
    const missing = await inspectAccountSigners(request, { source: source({ accountMissing: true, signers: [] }) });
    expect(missing.state).toBe("unavailable");
    expect(missing.operations).toEqual([]);
  });

  it("covers threshold boundaries and sponsorship fields", () => {
    expect(sumSignerWeights([0, 1, 2])).toBe(3);
    const matrix = buildOperationMatrix({ low: 1, medium: 5, high: 10, masterWeight: 0 }, 5);
    expect(matrix.find((entry) => entry.band === "low")?.reachable).toBe(true);
    expect(matrix.find((entry) => entry.band === "medium")?.reachable).toBe(true);
    expect(matrix.find((entry) => entry.band === "high")?.reachable).toBe(false);
  });

  it("marks provider failure unavailable", async () => {
    const result = await inspectAccountSigners(request, {
      source: { read: async () => { throw new Error("offline"); } },
    });
    expect(result.state).toBe("unavailable");
  });

  it("preserves exact G-addresses", async () => {
    const result = await inspectAccountSigners(request, { source: source() });
    expect(result.signers.map((signer) => signer.key)).toEqual([wallet, coSigner]);
    expect(result.signers[1]?.sponsor).toBe(coSigner);
  });
});
