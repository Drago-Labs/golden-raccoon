import { buildEventDecoderCoverage } from "./coverage";
import { formatDecodedContractEvent } from "./displayFormat";
import { EventDecoderError, type EventDecoderState } from "./errors";
import { matchEventAgainstSpecs } from "./eventMatcher";
import {
  createDefaultEventReader,
  paginateAndDeduplicateEvents,
  type ContractEventProvider,
} from "./eventReader";
import { isSupportedEventNetwork } from "./networkIdentity";
import { assessRetentionWindow } from "./retention";
import { eventDecoderRequestSchema, type EventDecoderReport } from "./schema";
import { createDefaultSpecReader, type ContractSpecProvider } from "./specReader";

export type EventDecoderDeps = {
  eventProvider?: ContractEventProvider;
  specProvider?: ContractSpecProvider;
};

export async function decodeContractEvents(
  rawInput: unknown,
  deps: EventDecoderDeps = {},
): Promise<EventDecoderReport> {
  const parsed = eventDecoderRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new EventDecoderError("Invalid event decoder request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedEventNetwork(input.network)) {
    throw new EventDecoderError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const eventProvider = deps.eventProvider ?? createDefaultEventReader();
  const specProvider = deps.specProvider ?? createDefaultSpecReader();

  let eventWindow;
  let specs;
  try {
    [eventWindow, specs] = await Promise.all([
      eventProvider.readContractEvents({
        contractId: input.contractId,
        startLedger: input.startLedger,
        endLedger: input.endLedger,
        network: input.network,
      }),
      specProvider.readContractEventSpecs({
        contractId: input.contractId,
        network: input.network,
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Soroban RPC provider unavailable";
    return {
      network: input.network,
      contractId: input.contractId,
      state: "unavailable",
      events: [],
      retention: null,
      coverage: buildEventDecoderCoverage({
        reachedProvider: false,
        specFound: false,
        eventsDecoded: 0,
        eventsUnmatched: 0,
        deduplicatedCount: 0,
        retention: null,
        message,
      }),
      warnings: [message],
    };
  }

  const retention = assessRetentionWindow({
    startLedger: input.startLedger,
    endLedger: input.endLedger,
    earliestRetainedLedger: eventWindow.earliestRetainedLedger,
    latestLedger: eventWindow.latestLedger,
  });

  const paginated = paginateAndDeduplicateEvents(eventWindow.pages);
  const filterText = input.topicFilter?.trim().toLowerCase() ?? "";

  const decodedEvents = paginated.events
    .map((ev) => {
      const match = matchEventAgainstSpecs(ev, specs);
      return formatDecodedContractEvent(ev, match);
    })
    .filter((ev) => {
      if (!filterText) return true;
      const inName = ev.matchedSpecName?.toLowerCase().includes(filterText) ?? false;
      const inTopics = ev.rawTopicsDisplay.some((t) => t.toLowerCase().includes(filterText));
      return inName || inTopics;
    });

  const eventsDecoded = decodedEvents.filter((e) => e.matchedSpecName !== null).length;
  const eventsUnmatched = decodedEvents.filter((e) => e.matchedSpecName === null).length;

  const warnings: string[] = [];
  if (retention.outsideRetention) {
    warnings.push(retention.statusMessage);
  }
  if (eventsUnmatched > 0) {
    warnings.push(
      `${eventsUnmatched} event(s) did not match a declared spec definition and are shown with raw ScVal fallback.`,
    );
  }

  const state: EventDecoderState =
    retention.outsideRetention || eventsUnmatched > 0 ? "partial" : "complete";

  return {
    network: input.network,
    contractId: input.contractId,
    state,
    events: decodedEvents,
    retention,
    coverage: buildEventDecoderCoverage({
      reachedProvider: true,
      specFound: specs.length > 0,
      eventsDecoded,
      eventsUnmatched,
      deduplicatedCount: paginated.duplicatesRemoved,
      retention,
      message: retention.statusMessage,
    }),
    warnings,
  };
}
