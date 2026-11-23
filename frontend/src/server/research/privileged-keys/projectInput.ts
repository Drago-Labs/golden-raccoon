import { PRIVILEGED_KEY_LIMITS } from "./limits";
import { PrivilegedKeysError } from "./errors";
import { isChain, type Deployment, type PrivilegeRecord } from "./schema";

export type InventoryInput = {
  projectId: string;
  deployments: Deployment[];
  privileges: PrivilegeRecord[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Accepts a registry-shaped deployment list. Rejects payloads over the published ceiling. */
export function parseInventoryInput(value: unknown): InventoryInput {
  const body = asRecord(value);
  if (!body) {
    throw new PrivilegedKeysError("unknown_format", "The inventory payload is not an object.");
  }
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) {
    throw new PrivilegedKeysError("invalid_project", "A project id is required.");
  }
  const deployments = readDeployments(body.deployments);
  const privileges = readPrivileges(body.privileges);
  if (deployments.length > PRIVILEGED_KEY_LIMITS.maxContracts) {
    throw new PrivilegedKeysError("too_many_contracts", "The deployment list exceeds the contract ceiling.");
  }
  if (privileges.length > PRIVILEGED_KEY_LIMITS.maxControllers) {
    throw new PrivilegedKeysError("too_many_controllers", "The privilege list exceeds the controller ceiling.");
  }
  return { projectId, deployments, privileges };
}

function readDeployments(value: unknown): Deployment[] {
  if (!Array.isArray(value)) return [];
  const rows: Deployment[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row || !isChain(row.chain) || typeof row.address !== "string" || typeof row.name !== "string") {
      continue;
    }
    rows.push({ chain: row.chain, address: row.address, name: row.name });
  }
  return rows;
}

function readPrivileges(value: unknown): PrivilegeRecord[] {
  if (!Array.isArray(value)) return [];
  const rows: PrivilegeRecord[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row || !isChain(row.chain) || typeof row.contract !== "string" || typeof row.role !== "string") {
      continue;
    }
    if (typeof row.controller !== "string") continue;
    rows.push({
      contract: row.contract,
      chain: row.chain,
      role: row.role,
      controller: row.controller,
      threshold: typeof row.threshold === "number" ? row.threshold : undefined,
      signers: Array.isArray(row.signers) ? row.signers.filter((s): s is string => typeof s === "string") : undefined,
      delaySeconds: typeof row.delaySeconds === "number" ? row.delaySeconds : undefined,
    });
  }
  return rows;
}
