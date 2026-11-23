import type { Deployment } from "./schema";

/** The deployments the registry already stored for the project. This module does not discover new contracts. */
export function readDeployments(deployments: Deployment[]): Deployment[] {
  const seen = new Set<string>();
  const rows: Deployment[] = [];
  for (const deployment of deployments) {
    const key = `${deployment.chain}:${deployment.address.toLowerCase()}`;
    if (seen.has(key) || deployment.address.trim() === "") continue;
    seen.add(key);
    rows.push(deployment);
  }
  return rows;
}
