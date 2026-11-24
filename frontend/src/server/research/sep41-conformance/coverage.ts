import { SEP41_REFERENCE_VERSION } from "./referenceInterface";
import type { CoverageNotice, EventShapeFinding, InterfaceDiffEntry, ReadSimulationEntry } from "./schema";

/**
 * Summarizes what this request actually managed to read, independent of
 * whether the overall result is "complete".
 */
export function buildCoverage(input: {
  reachedProvider: boolean;
  specAvailable: boolean;
  interfaceDiff: InterfaceDiffEntry[];
  simulations: ReadSimulationEntry[];
  eventsSampled: number;
  eventShapes: EventShapeFinding[];
}): CoverageNotice {
  const interfaceMatches = input.interfaceDiff.filter((e) => e.kind === "match").length;
  const interfaceMissing = input.interfaceDiff.filter((e) => e.kind === "missing").length;
  const interfaceMismatched = input.interfaceDiff.filter((e) => e.kind === "mismatched").length;
  const interfaceExtra = input.interfaceDiff.filter((e) => e.kind === "extra").length;
  const simulationsOk = input.simulations.filter((s) => s.ok && !s.authorizationRequired).length;
  const eventShapeFailures = input.eventShapes.filter((e) => !e.ok).length;

  const parts: string[] = [];
  parts.push(`Reference ${SEP41_REFERENCE_VERSION}.`);
  if (!input.reachedProvider) {
    parts.push("Provider was not reached.");
  } else if (!input.specAvailable) {
    parts.push("Spec was unavailable; only simulations and events that responded are shown.");
  } else {
    parts.push(
      `Interface: ${interfaceMatches} match, ${interfaceMissing} missing, ${interfaceMismatched} mismatched, ${interfaceExtra} extra.`,
    );
  }
  parts.push(`Simulations: ${simulationsOk}/${input.simulations.length} ok.`);
  parts.push(`Events sampled: ${input.eventsSampled}; shape failures: ${eventShapeFailures}.`);

  return {
    referenceVersion: SEP41_REFERENCE_VERSION,
    reachedProvider: input.reachedProvider,
    specAvailable: input.specAvailable,
    interfaceMatches,
    interfaceMissing,
    interfaceMismatched,
    interfaceExtra,
    simulationsOk,
    simulationsAttempted: input.simulations.length,
    eventsSampled: input.eventsSampled,
    eventShapeFailures,
    message: parts.join(" "),
  };
}
