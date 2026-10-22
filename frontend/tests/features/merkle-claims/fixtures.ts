import { encodeFunctionResult, type Hex } from "viem";
import { computeLeaf, type LeafEncoding } from "@/server/research/merkle-claims/leafEncoding";
import { hashPair } from "@/server/research/merkle-claims/merkleHash";
import type { MerkleRpc } from "@/server/research/merkle-claims/distributorReader";
import type { MerkleTreeFile } from "@/server/research/merkle-claims/treeLoader";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const wallet = "0x9999999999999999999999999999999999999999";
export const distributorAddress = "0x1111111111111111111111111111111111111111";
export const tokenAddress = "0x2222222222222222222222222222222222222222";
export const claimantA = `0x${"a".repeat(40)}`;
export const claimantB = `0x${"b".repeat(40)}`;
export const claimantC = `0x${"c".repeat(40)}`;

const bytes32Abi = [{ type: "function", name: "f", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] }] as const;
const addressAbi = [{ type: "function", name: "f", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;
const boolAbi = [{ type: "function", name: "f", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const;

const SELECTORS = { merkleRoot: "0x2eb4a7ab", token: "0xfc0c546a", isClaimed: "0x9e34070f" } as const;

export type MerkleFixtureOptions = {
  blockNumber?: bigint;
  failBlockNumber?: boolean;
  merkleRoot?: Hex | null;
  token?: string | null;
  isClaimedFor?: Record<string, boolean>;
};

/** A programmable fake `MerkleRpc` driven by scenario options rather than a fixed response table. */
export function merkleReader(options: MerkleFixtureOptions = {}): MerkleRpc {
  const isClaimedFor = options.isClaimedFor ?? {};

  return {
    async blockNumber() {
      if (options.failBlockNumber) throw new Error("Provider request failed");
      return options.blockNumber ?? 100n;
    },
    async call(_to, data) {
      const selector = data.slice(0, 10);
      if (selector === SELECTORS.merkleRoot) {
        return options.merkleRoot === undefined || options.merkleRoot === null
          ? null
          : encodeFunctionResult({ abi: bytes32Abi, functionName: "f", result: options.merkleRoot });
      }
      if (selector === SELECTORS.token) {
        return options.token ? encodeFunctionResult({ abi: addressAbi, functionName: "f", result: options.token as Hex }) : null;
      }
      if (selector === SELECTORS.isClaimed) {
        const index = BigInt(`0x${data.slice(10, 74)}`).toString();
        const claimed = isClaimedFor[index];
        return claimed === undefined ? null : encodeFunctionResult({ abi: boolAbi, functionName: "f", result: claimed });
      }
      return null;
    },
  };
}

export type TestTreeEntry = { account: string; amount: bigint; index: number };

/**
 * Builds a real, internally-consistent Merkle tree for a set of entries,
 * using this feature's own `computeLeaf`/`hashPair` — so a test tree is
 * guaranteed to verify against `verifyProof` by construction, without
 * needing to replicate any specific third-party generator's tree shape.
 * Odd nodes at a level promote unchanged, a common minimal convention;
 * `verifyProof` only needs a correct sibling list, not a specific shape.
 */
export function buildTestTree(entries: TestTreeEntry[], encoding: LeafEncoding): { root: Hex; file: MerkleTreeFile } {
  const leaves = entries.map((entry) => computeLeaf(encoding, { index: BigInt(entry.index), account: entry.account, amount: entry.amount }));

  const layers: Hex[][] = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? hashPair(current[i], current[i + 1]) : current[i]);
    }
    layers.push(next);
    current = next;
  }
  const root = current[0];

  function proofFor(leafIndex: number): Hex[] {
    const proof: Hex[] = [];
    let idx = leafIndex;
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const siblingIndex = idx % 2 === 1 ? idx - 1 : idx + 1;
      if (siblingIndex < layer.length) proof.push(layer[siblingIndex]);
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  const claims: MerkleTreeFile["claims"] = {};
  entries.forEach((entry, leafIndex) => {
    claims[entry.account] = { index: entry.index, amount: entry.amount.toString(), proof: proofFor(leafIndex) };
  });

  return { root, file: { merkleRoot: root, claims } };
}
