import type {
  ConformanceFinding,
  EventShapeFinding,
  InterfaceDiffEntry,
  ReadSimulationEntry,
} from "./schema";

/**
 * Collapses interface diffs, simulation outcomes, and event-shape results into
 * a short finding list for the UI summary.
 */
export function buildFindings(input: {
  interfaceDiff: InterfaceDiffEntry[];
  simulations: ReadSimulationEntry[];
  eventShapes: EventShapeFinding[];
  specAvailable: boolean;
}): ConformanceFinding[] {
  const findings: ConformanceFinding[] = [];

  if (!input.specAvailable) {
    findings.push({
      findingId: "spec-unavailable",
      kind: "coverage",
      subject: "contract_spec",
      detail: "Contract spec could not be read; interface comparison was skipped.",
    });
  }

  for (const entry of input.interfaceDiff) {
    if (entry.kind === "match") continue;
    findings.push({
      findingId: `interface:${entry.kind}:${entry.name}`,
      kind: entry.kind,
      subject: entry.name,
      detail: entry.detail,
    });
  }

  for (const sim of input.simulations) {
    if (sim.authorizationRequired) {
      findings.push({
        findingId: `simulation:auth:${sim.function}`,
        kind: "simulation",
        subject: sim.function,
        detail: `${sim.function} unexpectedly required authorization; SEP-41 read probes must stay signature-free.`,
      });
    }
    if (!sim.ok) {
      findings.push({
        findingId: `simulation:fail:${sim.function}`,
        kind: "simulation",
        subject: sim.function,
        detail: sim.error ?? `${sim.function} simulation failed`,
      });
    }
  }

  for (const shape of input.eventShapes) {
    if (shape.ok) continue;
    findings.push({
      findingId: `event:${shape.eventName}:${shape.sampleId ?? "none"}`,
      kind: "event",
      subject: shape.eventName,
      detail: shape.mismatchedField
        ? `${shape.detail} (field: ${shape.mismatchedField})`
        : shape.detail,
    });
  }

  return findings;
}
