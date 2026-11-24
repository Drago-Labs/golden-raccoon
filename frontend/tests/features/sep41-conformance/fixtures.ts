import conforming from "./data/conforming-token.json";
import missing from "./data/missing-functions.json";
import wrongEvents from "./data/wrong-event-shape.json";
import unavailable from "./data/provider-unavailable.json";
import type { Sep41ConformanceDeps } from "@/server/research/sep41-conformance";
import {
  contractSpecFromRecorded,
  normalizeSampledEvent,
} from "@/server/research/sep41-conformance";
import type { ReadSimulationEntry, SampledEvent } from "@/server/research/sep41-conformance";

export const CONTRACT_ID = conforming.contractId;
export const BALANCE_ID = "GA6BRICLKT2LQGPJSCIIDEXPEAC4OJMMRFRQXFLLWYZYX6UBPU65UIFH";

type RecordedFixture = {
  contractId: string;
  functions?: Array<{
    name: string;
    inputs: Array<{ name: string; type: string }>;
    outputs: Array<{ name: string; type: string }>;
  }>;
  simulations?: ReadSimulationEntry[];
  events?: Array<{
    id: string;
    ledger: number;
    topics: string[];
    data: unknown;
    dataKind?: string;
  }>;
  error?: string;
};

function sampleEventsFromFixture(fixture: RecordedFixture): SampledEvent[] {
  const events = fixture.events ?? [];
  return events
    .map((event, index) =>
      normalizeSampledEvent(
        {
          id: event.id,
          ledger: event.ledger,
          topics: event.topics,
          data: event.data,
        },
        index,
      ),
    )
    .filter((event): event is SampledEvent => event !== null);
}

export function depsFromFixture(fixture: RecordedFixture): Sep41ConformanceDeps {
  if (fixture.error) {
    return {
      specReader: {
        async readSpec() {
          throw new Error(fixture.error);
        },
      },
      readSimulator: {
        async simulateReads() {
          throw new Error(fixture.error);
        },
      },
      eventSampler: {
        async sampleEvents() {
          throw new Error(fixture.error);
        },
      },
    };
  }

  return {
    specReader: {
      async readSpec(contractId) {
        return contractSpecFromRecorded(contractId, fixture.functions ?? []);
      },
    },
    readSimulator: {
      async simulateReads() {
        return (fixture.simulations ?? []).map((entry) => ({
          ...entry,
          authorizationRequired: false,
        }));
      },
    },
    eventSampler: {
      async sampleEvents() {
        return sampleEventsFromFixture(fixture);
      },
    },
  };
}

export const fixtures = {
  conforming: conforming as RecordedFixture,
  missing: missing as RecordedFixture,
  wrongEvents: wrongEvents as RecordedFixture,
  unavailable: unavailable as RecordedFixture,
};

export const request = {
  contractId: CONTRACT_ID,
  network: "stellar-pubnet" as const,
  balanceId: BALANCE_ID,
};
