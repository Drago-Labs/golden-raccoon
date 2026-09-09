import { GateCheck } from "./types";
import { rollbackGate } from "./checks/rollback";
import { emergencyPauseGate } from "./checks/emergencyPause";
import { smokeGate } from "./checks/smoke";
import { loadGate } from "./checks/load";
import { deploymentRecordGate } from "./checks/deploymentRecord";
import { budgetsGate } from "./checks/budgets";

const registry: Map<string, GateCheck> = new Map([
  [rollbackGate.id, rollbackGate],
  [emergencyPauseGate.id, emergencyPauseGate],
  [smokeGate.id, smokeGate],
  [loadGate.id, loadGate],
  [deploymentRecordGate.id, deploymentRecordGate],
  [budgetsGate.id, budgetsGate],
]);

/**
 * Retrieves all registered readiness gate checks.
 */
export function getAllGates(): GateCheck[] {
  return Array.from(registry.values());
}

/**
 * Retrieves a single readiness gate check by identifier.
 */
export function getGate(id: string): GateCheck | undefined {
  return registry.get(id);
}

/**
 * Registers an additional or override gate check.
 */
export function registerGate(gate: GateCheck): void {
  registry.set(gate.id, gate);
}
