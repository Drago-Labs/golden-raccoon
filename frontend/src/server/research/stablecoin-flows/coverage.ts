import type { Deployment } from "./assetRegistry";
import type { ChainCoverage, ChainReadResult, FlowEvent } from "./schema";
import type { ResolvedWindow } from "./windowing";

function identity(deployment: Deployment): string {
  return deployment.kind === "evm" ? deployment.address : `${deployment.assetCode}:${deployment.issuer}`;
}

/**
 * States per chain how complete its evidence is, in plain words: a chain that
 * could not be read at all, one whose provider page filled up, and one whose
 * derived read range could not reach the start of the window are all reported
 * rather than silently presented as a complete answer.
 */
export function chainCoverage(results: ChainReadResult[], deployments: Deployment[]): ChainCoverage[] {
  return deployments.map((deployment) => {
    const result = results.find((candidate) => candidate.chain === deployment.chain);
    const events = result?.events ?? [];
    const times = events.map((event) => event.at).sort();
    const notes: string[] = [];
    let state: ChainCoverage["state"] = "complete";

    if (!result || result.failure) {
      state = "unavailable";
      notes.push(result?.failure ?? "This chain was not read.");
      notes.push("No mint or burn is assumed for a chain that could not be read; it is left out of the totals.");
    } else {
      if (result.truncated) {
        state = "partial";
        notes.push("The provider returned as many events as this reader accepts, so older events in the window are missing.");
      }
      if (result.rangeNote) {
        state = "partial";
        notes.push(result.rangeNote);
      }
      if (!events.length) {
        notes.push("The chain was read and reported no mint or burn in this window.");
      }
    }

    return {
      chain: deployment.chain,
      state,
      eventCount: events.length,
      truncated: Boolean(result?.truncated),
      firstEventAt: times[0] ?? null,
      lastEventAt: times[times.length - 1] ?? null,
      notes,
      identity: identity(deployment),
      sourceUrl: deployment.sourceUrl,
    };
  });
}

/** The report-level state: the weakest chain decides. */
export function reportState(coverage: ChainCoverage[]): "complete" | "partial" | "unavailable" {
  if (!coverage.length || coverage.every((chain) => chain.state === "unavailable")) return "unavailable";
  return coverage.some((chain) => chain.state !== "complete") ? "partial" : "complete";
}

/** What the report as a whole does and does not cover. */
export function reportNotes(coverage: ChainCoverage[], events: FlowEvent[], window: ResolvedWindow): string[] {
  const notes = [
    "Mints and burns are read from each chain's own records: zero-address ERC-20 Transfer logs on EVM chains, and payments out of and into the issuing account on Stellar.",
    "Amounts are exact integers rescaled to one common decimal scale for the asset; no amount is divided, rounded or converted to a price.",
    `Window ${window.start} through ${window.end}, aggregated by UTC day.`,
  ];
  const unavailable = coverage.filter((chain) => chain.state === "unavailable").map((chain) => chain.chain);
  const partial = coverage.filter((chain) => chain.state === "partial").map((chain) => chain.chain);
  if (unavailable.length) notes.push(`Not read, and therefore absent from every total: ${unavailable.join(", ")}.`);
  if (partial.length) notes.push(`Incomplete coverage, so totals for these chains are a floor rather than a sum: ${partial.join(", ")}.`);
  if (!events.length) notes.push("No mint or burn was recorded in this window on the chains that could be read.");
  notes.push("Supply flow is not peg behaviour: this feature states what was issued and redeemed, and forecasts nothing.");
  return notes;
}
