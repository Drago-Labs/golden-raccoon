import type { Hex } from "viem";
import { assessClaimStatus } from "./claimStatus";
import { resolveMerkleNetwork } from "./chainIdentity";
import { buildCoverage } from "./coverage";
import { createHttpMerkleRpc, readIsClaimed, readMerkleRoot, readToken, type MerkleRpc } from "./distributorReader";
import { MerkleClaimsError } from "./errors";
import { verifyClaimEntry } from "./proofVerifier";
import type { MerkleClaimsRequest, MerkleClaimsResult } from "./schema";
import { loadTreeFile, TreeLoadError, type MerkleTreeFile } from "./treeLoader";

function findClaimEntry(tree: MerkleTreeFile, address: string) {
  const target = address.toLowerCase();
  const key = Object.keys(tree.claims).find((candidate) => candidate.toLowerCase() === target);
  return key ? tree.claims[key] : undefined;
}

export async function verifyMerkleClaim(input: MerkleClaimsRequest, deps: { rpc?: MerkleRpc } = {}): Promise<MerkleClaimsResult> {
  const network = resolveMerkleNetwork(input.network);
  if (!network) {
    throw new MerkleClaimsError("Unsupported network", "unsupported_network", false);
  }

  const rpc = deps.rpc ?? createHttpMerkleRpc(network.rpcUrl);
  const warnings: string[] = [];

  try {
    const block = input.blockNumber !== undefined ? BigInt(input.blockNumber) : await rpc.blockNumber();

    const [onChainRoot, token] = await Promise.all([
      readMerkleRoot(rpc, input.distributorAddress, block),
      readToken(rpc, input.distributorAddress, block),
    ]);
    if (onChainRoot === null) {
      warnings.push("Could not read merkleRoot() from the distributor contract.");
    }

    let treeFile: MerkleTreeFile | null = null;
    try {
      treeFile = await loadTreeFile(input.treeSource);
    } catch (error) {
      warnings.push(error instanceof TreeLoadError ? error.message : "Failed to load the tree file.");
    }

    const entry = treeFile ? findClaimEntry(treeFile, input.claimAddress) : undefined;
    if (treeFile && !entry) {
      warnings.push(`${input.claimAddress} was not found in the loaded tree file.`);
    }

    const fileReportedRootMatchesChain = treeFile && onChainRoot ? treeFile.merkleRoot.toLowerCase() === onChainRoot.toLowerCase() : null;

    let proofValid = false;
    let leaf: Hex | null = null;
    let computedRoot: Hex | null = null;
    let proofReason = "proof not checked";
    const proofChecked = Boolean(entry) && onChainRoot !== null;
    if (entry && onChainRoot !== null) {
      const result = verifyClaimEntry(input.leafEncoding, input.claimAddress, entry, onChainRoot as Hex);
      leaf = result.leaf;
      computedRoot = result.verification.computedRoot;
      proofValid = result.verification.valid;
      proofReason = result.verification.reason;
      if (!proofValid) warnings.push("Proof does not fold up to the on-chain root for this address.");
    }

    const alreadyClaimed = entry && proofValid ? await readIsClaimed(rpc, input.distributorAddress, BigInt(entry.index), block) : null;
    if (entry && proofValid && alreadyClaimed === null) {
      warnings.push("Could not read isClaimed() from the distributor contract.");
    }

    const claim = assessClaimStatus({
      inTree: Boolean(entry),
      proofValid,
      fileReportedRootMatchesChain,
      alreadyClaimed,
    });

    const coverage = buildCoverage({
      onChainRootRead: onChainRoot !== null,
      treeLoaded: treeFile !== null,
      proofChecked,
      claimStatusRead: alreadyClaimed !== null,
    });

    const claimedUnknown = Boolean(entry) && proofValid && alreadyClaimed === null;
    const incomplete = onChainRoot === null || treeFile === null || claimedUnknown;

    return {
      network: input.network,
      distributorAddress: input.distributorAddress,
      claimAddress: input.claimAddress,
      state: incomplete ? "partial" : "complete",
      onChainRoot,
      token,
      tree: {
        loaded: treeFile !== null,
        source: input.treeSource,
        fileReportedRoot: treeFile?.merkleRoot ?? null,
        entryIndex: entry?.index ?? null,
        entryAmount: entry?.amount ?? null,
        proofLength: entry?.proof.length ?? null,
      },
      proof: { leaf, computedRoot, valid: proofValid, reason: proofReason },
      claim,
      coverage,
      warnings,
    };
  } catch (error) {
    return {
      network: input.network,
      distributorAddress: input.distributorAddress,
      claimAddress: input.claimAddress,
      state: "unavailable",
      onChainRoot: null,
      token: null,
      tree: { loaded: false, source: input.treeSource, fileReportedRoot: null, entryIndex: null, entryAmount: null, proofLength: null },
      proof: { leaf: null, computedRoot: null, valid: false, reason: "provider unavailable" },
      claim: { inTree: false, proofValid: false, fileReportedRootMatchesChain: null, alreadyClaimed: null, eligible: false, reason: "provider unavailable" },
      coverage: { onChainRootRead: false, treeLoaded: false, proofChecked: false, claimStatusRead: false },
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
