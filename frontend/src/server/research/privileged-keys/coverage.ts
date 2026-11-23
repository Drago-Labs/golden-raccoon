import type { Chain, Coverage, Deployment } from "./schema";

/** Says which chains were actually read. A chain with no deployment is a gap, not a silent zero. */
export function buildCoverage(deployments: Deployment[], unread: string[]): Coverage {
  const chains = [...new Set(deployments.map((row) => row.chain))] as Chain[];
  const notes = [
    "Controllers are classified only from the privilege rows supplied for this project.",
    "A controller with no threshold and no delay is a single key, not a multisig.",
  ];
  if (unread.length > 0) notes.push(`Unread: ${unread.join(", ")}.`);
  if (!chains.includes("soroban")) notes.push("No Soroban deployment was in the registry list.");
  if (!chains.includes("evm")) notes.push("No EVM deployment was in the registry list.");
  return { contractsRead: deployments.length, chains, notes };
}
