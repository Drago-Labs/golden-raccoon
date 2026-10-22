import { keccak256, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { computeLeaf } from "@/server/research/merkle-claims/leafEncoding";
import { hashPair } from "@/server/research/merkle-claims/merkleHash";

const account = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("computeLeaf", () => {
  it("is deterministic for the same inputs and encoding", () => {
    const a = computeLeaf("index-account-amount-packed", { index: 0n, account, amount: 100n });
    const b = computeLeaf("index-account-amount-packed", { index: 0n, account, amount: 100n });
    expect(a).toBe(b);
  });

  it("produces different leaves for different encodings of the same inputs", () => {
    const packedWithIndex = computeLeaf("index-account-amount-packed", { index: 0n, account, amount: 100n });
    const packedNoIndex = computeLeaf("account-amount-packed", { index: 0n, account, amount: 100n });
    const doubleHashed = computeLeaf("account-amount-abi-double-hashed", { index: 0n, account, amount: 100n });
    expect(new Set([packedWithIndex, packedNoIndex, doubleHashed]).size).toBe(3);
  });

  it("changes the leaf when the amount changes", () => {
    const a = computeLeaf("account-amount-packed", { index: 0n, account, amount: 100n });
    const b = computeLeaf("account-amount-packed", { index: 0n, account, amount: 101n });
    expect(a).not.toBe(b);
  });

  it("changes the index-based leaf when only the index changes", () => {
    const a = computeLeaf("index-account-amount-packed", { index: 0n, account, amount: 100n });
    const b = computeLeaf("index-account-amount-packed", { index: 1n, account, amount: 100n });
    expect(a).not.toBe(b);
  });
});

describe("hashPair", () => {
  it("is commutative: the result does not depend on argument order", () => {
    const left = toHex(1, { size: 32 });
    const right = toHex(2, { size: 32 });
    expect(hashPair(left, right)).toBe(hashPair(right, left));
  });

  it("matches a manually sorted keccak256 concatenation", () => {
    const left = toHex(5, { size: 32 });
    const right = toHex(9, { size: 32 });
    const expected = keccak256(`${left}${right.slice(2)}` as `0x${string}`);
    expect(hashPair(left, right)).toBe(expected);
  });
});
