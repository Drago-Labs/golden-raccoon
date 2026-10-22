import { resolveDeployerNetwork } from "./chainIdentity";
import { groupByCodeHash, hashDeployments } from "./codeHashGrouping";
import { buildCoverage } from "./coverage";
import { createHttpDeployerRpc, findCreationBlock, findDeployerInBlock, type DeployerRpc } from "./deployerLookup";
import { scanDeployments } from "./deploymentScan";
import { DeployerHistoryError } from "./errors";
import { matchFlaggedHashes } from "./flaggedHashes";
import { traceFundingTrail } from "./fundingTrail";
import { MAX_FUNDING_HOPS } from "./limits";
import type { DeployerHistoryRequest, DeployerHistoryResult } from "./schema";

export async function inspectDeployerHistory(
  input: DeployerHistoryRequest,
  deps: { rpc?: DeployerRpc } = {},
): Promise<DeployerHistoryResult> {
  const network = resolveDeployerNetwork(input.network);
  if (!network) {
    throw new DeployerHistoryError("Unsupported network", "unsupported_network", false);
  }

  const rpc = deps.rpc ?? createHttpDeployerRpc(network.rpcUrl);
  const warnings: string[] = [];

  try {
    const latest = await rpc.blockNumber();
    const creationBlock = await findCreationBlock(rpc, input.contractAddress, latest);

    if (creationBlock === null) {
      return {
        network: input.network,
        contractAddress: input.contractAddress,
        state: "complete",
        lookup: { deployer: null, creationBlock: null, creationTxHash: null, direct: false },
        deployments: [],
        templateGroups: [],
        fundingTrail: [],
        flaggedMatches: [],
        coverage: buildCoverage({ deployerFound: false, deploymentScan: null, fundingHopsRequested: MAX_FUNDING_HOPS, fundingHopsCompleted: 0 }),
        warnings: ["The target address has no code at the latest block — it is not a deployed contract."],
      };
    }

    const block = await rpc.getBlock(creationBlock);
    if (!block) {
      throw new DeployerHistoryError("Could not fetch the creation block", "provider_unavailable", true);
    }
    const lookup = findDeployerInBlock(block, input.contractAddress);

    if (!lookup.deployer) {
      warnings.push(
        "Could not determine the deployer directly: the contract was likely created through a factory's internal CREATE/CREATE2 call, which is not visible without trace-level data this feature does not use.",
      );
      return {
        network: input.network,
        contractAddress: input.contractAddress,
        state: "partial",
        lookup,
        deployments: [],
        templateGroups: [],
        fundingTrail: [],
        flaggedMatches: [],
        coverage: buildCoverage({ deployerFound: false, deploymentScan: null, fundingHopsRequested: MAX_FUNDING_HOPS, fundingHopsCompleted: 0 }),
        warnings,
      };
    }

    const { deployments: rawDeployments, coverage: deploymentScanCoverage } = await scanDeployments(
      rpc,
      lookup.deployer,
      BigInt(lookup.creationBlock!),
      latest,
    );
    if (deploymentScanCoverage.truncated) {
      warnings.push(`Deployment history is truncated to blocks ${deploymentScanCoverage.fromBlock}–${deploymentScanCoverage.toBlock}.`);
    }

    // The scan window naturally re-finds the target's own creation, since
    // it's a `to: null` transaction from the same deployer. It's excluded
    // from the "other deployments" list shown to the caller (the target
    // is already shown in the lookup summary) — but it stays in the set
    // used for template-grouping and flagged-hash matching, since
    // checking the *target's own* code against known-bad templates is
    // this feature's single most important read.
    const target = input.contractAddress.toLowerCase();
    const allDeployments = await hashDeployments(rpc, [
      { address: input.contractAddress, blockNumber: lookup.creationBlock!, txHash: lookup.creationTxHash!, codeHash: null },
      ...rawDeployments.filter((d) => d.address.toLowerCase() !== target),
    ]);
    const deployments = allDeployments.filter((d) => d.address.toLowerCase() !== target);
    const templateGroups = groupByCodeHash(allDeployments);
    const flaggedMatches = matchFlaggedHashes(allDeployments);

    const fundingTrail = await traceFundingTrail(rpc, lookup.deployer, BigInt(lookup.creationBlock!));
    const fundingHopsCompleted = fundingTrail.filter((h) => h.transactions.length > 0).length;
    if (fundingHopsCompleted < MAX_FUNDING_HOPS && fundingTrail.length < MAX_FUNDING_HOPS) {
      warnings.push("The funding trail stopped early: no incoming value transfer was found in the scanned window.");
    }

    return {
      network: input.network,
      contractAddress: input.contractAddress,
      state: deploymentScanCoverage.truncated ? "partial" : "complete",
      lookup,
      deployments,
      templateGroups,
      fundingTrail,
      flaggedMatches,
      coverage: buildCoverage({
        deployerFound: true,
        deploymentScan: deploymentScanCoverage,
        fundingHopsRequested: MAX_FUNDING_HOPS,
        fundingHopsCompleted,
      }),
      warnings,
    };
  } catch (error) {
    return {
      network: input.network,
      contractAddress: input.contractAddress,
      state: "unavailable",
      lookup: { deployer: null, creationBlock: null, creationTxHash: null, direct: false },
      deployments: [],
      templateGroups: [],
      fundingTrail: [],
      flaggedMatches: [],
      coverage: buildCoverage({ deployerFound: false, deploymentScan: null, fundingHopsRequested: MAX_FUNDING_HOPS, fundingHopsCompleted: 0 }),
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
