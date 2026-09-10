import type { GateContext, GateDefinition } from "./types";
import { checkRollback } from "./checks/rollback";
import { checkEmergencyPause } from "./checks/emergencyPause";
import { checkSmoke } from "./checks/smoke";
import { checkLoad } from "./checks/load";
import { checkDeploymentRecord } from "./checks/deploymentRecord";
import { checkBudgets } from "./checks/budgets";

export const registeredGates: GateDefinition[] = [
  {
    id: "gate_rollback_rehearsal",
    name: "Rollback Rehearsal",
    severity: "critical",
    description: "Verifies documented rollback procedures and automated execution kill switches.",
    run: checkRollback,
  },
  {
    id: "gate_emergency_pause_rehearsal",
    name: "Emergency Pause Rehearsal",
    severity: "critical",
    description: "Exercises EVM and Soroban emergency pause contracts and frontend killswitches.",
    run: checkEmergencyPause,
  },
  {
    id: "gate_smoke_coverage",
    name: "Critical Route Smoke Coverage",
    severity: "critical",
    description: "Ensures smoke coverage spans all critical endpoints with structured assertion baselines.",
    run: checkSmoke,
  },
  {
    id: "gate_load_behavior",
    name: "Load Behavior & Baseline Comparison",
    severity: "warning",
    description: "Validates execution and simulation load generators against performance budgets.",
    run: checkLoad,
  },
  {
    id: "gate_deployment_record",
    name: "Target Environment Deployment Record",
    severity: "critical",
    description: "Validates presence and schema completeness of deployment records for the target environment.",
    run: checkDeploymentRecord,
  },
  {
    id: "gate_slo_budgets",
    name: "SLO & Error Budget Enforcement",
    severity: "warning",
    description: "Ensures error budget burn rates and latency SLOs are within acceptable release thresholds.",
    run: checkBudgets,
  },
];
