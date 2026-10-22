import { getContractAddress } from "viem";
import { DEPLOYMENT_SCAN_WINDOW_BLOCKS, MAX_DEPLOYMENTS } from "./limits";
import type { DeployerRpc } from "./deployerLookup";
import type { Deployment, ScanCoverage } from "./schema";

/**
 * Scans `[creationBlock - window, creationBlock + window]`, clamped to
 * `[0, latest]`, for other direct (`to: null`) contract creations by
 * `deployer`. Blocks are fetched in parallel; results are sorted oldest
 * first and capped at `MAX_DEPLOYMENTS`.
 */
export async function scanDeployments(
  rpc: DeployerRpc,
  deployer: string,
  creationBlock: bigint,
  latest: bigint,
  windowBlocks: bigint = DEPLOYMENT_SCAN_WINDOW_BLOCKS,
): Promise<{ deployments: Deployment[]; coverage: ScanCoverage }> {
  const fromBlock = creationBlock > windowBlocks ? creationBlock - windowBlocks : 0n;
  const toBlock = creationBlock + windowBlocks > latest ? latest : creationBlock + windowBlocks;

  const blockNumbers: bigint[] = [];
  for (let b = fromBlock; b <= toBlock; b += 1n) blockNumbers.push(b);

  const blocks = await Promise.all(blockNumbers.map((b) => rpc.getBlock(b)));
  const target = deployer.toLowerCase();
  const deployments: Deployment[] = [];

  for (const block of blocks) {
    if (!block) continue;
    for (const tx of block.transactions) {
      if (tx.to !== null || tx.from.toLowerCase() !== target) continue;
      const address = getContractAddress({ from: tx.from as `0x${string}`, nonce: BigInt(tx.nonce) });
      deployments.push({ address, blockNumber: block.number, txHash: tx.hash, codeHash: null });
    }
  }

  deployments.sort((a, b) => a.blockNumber - b.blockNumber);
  const truncated = deployments.length > MAX_DEPLOYMENTS || blocks.some((b) => b === null);

  return {
    deployments: deployments.slice(0, MAX_DEPLOYMENTS),
    coverage: { fromBlock: Number(fromBlock), toBlock: Number(toBlock), truncated },
  };
}
