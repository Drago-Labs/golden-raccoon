import { describe, expect, it } from "vitest";
import { computeLeaf } from "@/server/research/merkle-claims/leafEncoding";
import { verifyProof } from "@/server/research/merkle-claims/merkleHash";
import { buildTestTree, claimantA, claimantB, claimantC } from "./fixtures";

const entries = [
  { account: claimantA, amount: 100n, index: 0 },
  { account: claimantB, amount: 200n, index: 1 },
  { account: claimantC, amount: 300n, index: 2 },
];

describe("verifyProof", () => {
  it("validates every real entry's proof against the tree's own root", () => {
    const { root, file } = buildTestTree(entries, "index-account-amount-packed");
    for (const entry of entries) {
      const claim = file.claims[entry.account];
      const leaf = computeLeaf("index-account-amount-packed", { index: BigInt(claim.index), account: entry.account, amount: BigInt(claim.amount) });
      const result = verifyProof(leaf, claim.proof as `0x${string}`[], root);
      expect(result.valid).toBe(true);
      expect(result.computedRoot).toBe(root);
    }
  });

  it("rejects a tampered amount", () => {
    const { root, file } = buildTestTree(entries, "index-account-amount-packed");
    const claim = file.claims[claimantA];
    const tamperedLeaf = computeLeaf("index-account-amount-packed", { index: BigInt(claim.index), account: claimantA, amount: 999_999n });
    const result = verifyProof(tamperedLeaf, claim.proof as `0x${string}`[], root);
    expect(result.valid).toBe(false);
  });

  it("rejects a tampered proof sibling", () => {
    const { root, file } = buildTestTree(entries, "index-account-amount-packed");
    const claim = file.claims[claimantA];
    const leaf = computeLeaf("index-account-amount-packed", { index: BigInt(claim.index), account: claimantA, amount: BigInt(claim.amount) });
    const tamperedProof = [...claim.proof] as `0x${string}`[];
    tamperedProof[0] = `0x${"f".repeat(64)}`;
    const result = verifyProof(leaf, tamperedProof, root);
    expect(result.valid).toBe(false);
  });

  it("rejects a proof checked against the wrong root", () => {
    const { file } = buildTestTree(entries, "index-account-amount-packed");
    const claim = file.claims[claimantA];
    const leaf = computeLeaf("index-account-amount-packed", { index: BigInt(claim.index), account: claimantA, amount: BigInt(claim.amount) });
    const result = verifyProof(leaf, claim.proof as `0x${string}`[], `0x${"0".repeat(64)}`);
    expect(result.valid).toBe(false);
  });

  it("rejects an oversized proof outright rather than folding it", () => {
    const { root, file } = buildTestTree(entries, "index-account-amount-packed");
    const claim = file.claims[claimantA];
    const leaf = computeLeaf("index-account-amount-packed", { index: BigInt(claim.index), account: claimantA, amount: BigInt(claim.amount) });
    const oversizedProof = Array.from({ length: 65 }, () => `0x${"1".repeat(64)}` as const);
    const result = verifyProof(leaf, oversizedProof, root);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exceeds/);
  });

  it("validates a single-entry tree where the leaf is the root", () => {
    const { root, file } = buildTestTree([{ account: claimantA, amount: 100n, index: 0 }], "index-account-amount-packed");
    const claim = file.claims[claimantA];
    const leaf = computeLeaf("index-account-amount-packed", { index: BigInt(claim.index), account: claimantA, amount: BigInt(claim.amount) });
    expect(claim.proof).toHaveLength(0);
    const result = verifyProof(leaf, [], root);
    expect(result.valid).toBe(true);
  });
});
