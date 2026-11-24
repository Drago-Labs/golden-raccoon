import { parseContractInput } from "./contractInput";
import { buildCoverage } from "./coverage";
import { Sep41ConformanceError, type Sep41ConformanceState } from "./errors";
import { validateEventShapes } from "./eventShapes";
import { createHttpEventSampler, type EventSampler } from "./eventSampler";
import { buildFindings } from "./findings";
import { diffInterface } from "./interfaceDiff";
import {
  assertReadOnlySimulations,
  createHttpReadSimulator,
  unavailableSimulations,
  type ReadSimulationDeps,
} from "./readSimulation";
import {
  SEP41_CONFORMANCE_SCHEMA_VERSION,
  type SampledEvent,
  type Sep41ConformanceReport,
} from "./schema";
import { SEP41_REFERENCE_VERSION } from "./referenceInterface";
import { createHttpSpecReader, type SpecReader } from "./specReader";

export type Sep41ConformanceDeps = {
  specReader?: SpecReader;
  readSimulator?: ReadSimulationDeps;
  eventSampler?: EventSampler;
};

function emptyReport(
  contractId: string,
  network: string,
  state: Sep41ConformanceState,
  message: string,
): Sep41ConformanceReport {
  const simulations = unavailableSimulations(message);
  const coverage = buildCoverage({
    reachedProvider: false,
    specAvailable: false,
    interfaceDiff: [],
    simulations,
    eventsSampled: 0,
    eventShapes: [],
  });
  coverage.message = message;

  return {
    schemaVersion: SEP41_CONFORMANCE_SCHEMA_VERSION,
    referenceVersion: SEP41_REFERENCE_VERSION,
    contractId,
    network,
    state,
    interfaceDiff: [],
    simulations,
    eventSamples: [],
    eventShapes: [],
    findings: buildFindings({
      interfaceDiff: [],
      simulations,
      eventShapes: [],
      specAvailable: false,
    }),
    coverage,
    readOnly: true,
    writesState: false,
  };
}

/**
 * Builds a read-only SEP-41 conformance report for a Soroban token contract.
 * Never sends authenticated or state-changing requests.
 */
export async function inspectSep41Conformance(
  body: unknown,
  deps: Sep41ConformanceDeps = {},
): Promise<Sep41ConformanceReport> {
  const input = parseContractInput(body);
  const specReader = deps.specReader ?? createHttpSpecReader();
  const readSimulator = deps.readSimulator ?? createHttpReadSimulator();
  const eventSampler = deps.eventSampler ?? createHttpEventSampler();

  try {
    let specAvailable = false;
    let interfaceDiff = diffInterface([]);
    let reachedProvider = true;

    try {
      const spec = await specReader.readSpec(input.contractId, input.network);
      if (spec) {
        specAvailable = true;
        interfaceDiff = diffInterface(spec.functions);
      } else {
        interfaceDiff = [];
      }
    } catch {
      reachedProvider = false;
      return emptyReport(input.contractId, input.network, "unavailable", "Provider unavailable while reading contract spec");
    }

    let simulations = unavailableSimulations("Simulation skipped");
    try {
      simulations = assertReadOnlySimulations(
        await readSimulator.simulateReads(input.contractId, input.network, input.balanceId),
      );
      // Hard guarantee: this feature never marks a probe as auth-gated.
      if (simulations.some((entry) => entry.authorizationRequired)) {
        simulations = simulations.map((entry) => ({ ...entry, authorizationRequired: false }));
      }
    } catch (error) {
      simulations = unavailableSimulations(
        error instanceof Error ? error.message : "Simulation provider unavailable",
      );
    }

    let eventSamples: SampledEvent[] = [];
    try {
      eventSamples = await eventSampler.sampleEvents(input.contractId, input.network);
    } catch {
      eventSamples = [];
    }

    const eventShapes = validateEventShapes(eventSamples);
    const findings = buildFindings({
      interfaceDiff,
      simulations,
      eventShapes,
      specAvailable,
    });
    const coverage = buildCoverage({
      reachedProvider,
      specAvailable,
      interfaceDiff,
      simulations,
      eventsSampled: eventSamples.length,
      eventShapes,
    });

    const incomplete =
      !specAvailable ||
      interfaceDiff.some((entry) => entry.kind === "missing" || entry.kind === "mismatched") ||
      simulations.some((entry) => !entry.ok) ||
      eventShapes.some((entry) => !entry.ok);

    const state: Sep41ConformanceState = incomplete ? "partial" : "complete";

    return {
      schemaVersion: SEP41_CONFORMANCE_SCHEMA_VERSION,
      referenceVersion: SEP41_REFERENCE_VERSION,
      contractId: input.contractId,
      network: input.network,
      state,
      interfaceDiff,
      simulations,
      eventSamples,
      eventShapes,
      findings,
      coverage,
      readOnly: true,
      writesState: false,
    };
  } catch (error) {
    if (error instanceof Sep41ConformanceError) throw error;
    return emptyReport(
      input.contractId,
      input.network,
      "unavailable",
      error instanceof Error ? error.message : "Provider unavailable",
    );
  }
}
