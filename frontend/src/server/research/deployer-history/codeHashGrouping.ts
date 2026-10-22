import { keccak256 } from "viem";
import type { DeployerRpc } from "./deployerLookup";
import type { Deployment, TemplateGroup } from "./schema";

/**
 * Fills in each deployment's runtime-code hash (reading its code at the
 * deployment's own block) and groups deployments that share one hash —
 * evidence of the same contract template being redeployed.
 */
export async function hashDeployments(rpc: DeployerRpc, deployments: Deployment[]): Promise<Deployment[]> {
  return Promise.all(
    deployments.map(async (deployment) => {
      const code = await rpc.getCode(deployment.address, BigInt(deployment.blockNumber));
      const codeHash = code && code !== "0x" ? keccak256(code as `0x${string}`) : null;
      return { ...deployment, codeHash };
    }),
  );
}

export function groupByCodeHash(deployments: Deployment[]): TemplateGroup[] {
  const groups = new Map<string, string[]>();
  for (const deployment of deployments) {
    if (!deployment.codeHash) continue;
    const list = groups.get(deployment.codeHash) ?? [];
    list.push(deployment.address);
    groups.set(deployment.codeHash, list);
  }
  // Only template reuse is interesting: a hash with exactly one deployment
  // isn't a "group" in any useful sense, so it's left out.
  return [...groups.entries()]
    .filter(([, addresses]) => addresses.length > 1)
    .map(([codeHash, deploymentsForHash]) => ({ codeHash, deployments: deploymentsForHash }));
}
