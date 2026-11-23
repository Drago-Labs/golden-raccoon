import { buildCoverage } from "./coverage";
import { readDeployments } from "./deploymentReader";
import { PrivilegedKeysError, type WorkState } from "./errors";
import { readEvmRoles } from "./evmRoles";
import { groupByController } from "./grouping";
import { parseInventoryInput } from "./projectInput";
import { readSorobanAdmins } from "./sorobanAdmins";
import type { ContractView, InventoryReport } from "./schema";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read-only inventory. It never sends a transaction or changes a role. */
export function buildPrivilegedKeyInventory(value: unknown): WorkState<InventoryReport> {
  const body = asRecord(value);
  if (body?.unavailable === true) {
    const reason = typeof body.reason === "string" ? body.reason : "The chain provider did not answer.";
    return { kind: "unavailable", reason };
  }
  if (body && body.privileges !== undefined && !Array.isArray(body.privileges)) {
    return { kind: "unknown_format", reason: "Privilege rows were not a list." };
  }
  try {
    const input = parseInventoryInput(value);
    const deployments = readDeployments(input.deployments);
    const privileges = [...readEvmRoles(input.privileges), ...readSorobanAdmins(input.privileges)];
    const controllers = groupByController(privileges);
    const contracts: ContractView[] = deployments.map((deployment) => ({
      address: deployment.address,
      chain: deployment.chain,
      name: deployment.name,
      controllers: controllers
        .filter((controller) => controller.contracts.includes(deployment.address))
        .map((controller) => controller.address),
    }));
    const summary = {
      multisig: controllers.filter((row) => row.kind === "multisig").length,
      timelock: controllers.filter((row) => row.kind === "timelock").length,
      singleKey: controllers.filter((row) => row.kind === "single_key").length,
      unknown: controllers.filter((row) => row.kind === "unknown").length,
    };
    return {
      kind: "ready",
      report: {
        projectId: input.projectId,
        controllers,
        contracts,
        coverage: buildCoverage(deployments, []),
        summary,
      },
    };
  } catch (error) {
    if (error instanceof PrivilegedKeysError && error.code === "unknown_format") {
      return { kind: "unknown_format", reason: error.message };
    }
    if (error instanceof PrivilegedKeysError) {
      return { kind: "unknown_format", reason: error.message };
    }
    return { kind: "unknown_format", reason: "The inventory payload could not be read." };
  }
}
