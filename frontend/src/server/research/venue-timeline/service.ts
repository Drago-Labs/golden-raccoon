export class VenueTimelineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "VenueTimelineError";
    this.code = code;
  }
}

export type VenueState = "listed" | "paused" | "delisted" | "unknown";

export type VenueObservation = {
  venue: string;
  chainId: number;
  contract: string;
  ticker: string;
  reachable: boolean;
  state: Exclude<VenueState, "unknown"> | null;
  observedAt: string;
};

export type VenueTimeline = {
  token: { chainId: number; contract: string };
  venues: { venue: string; state: VenueState; source: string }[];
  timeline: { venue: string; from: VenueState | null; to: VenueState; observedAt: string; source: string }[];
  coverage: string;
};

export function buildVenueTimeline(input: {
  chainId: number;
  contract: string;
  snapshots: VenueObservation[][];
}): VenueTimeline {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.contract)) {
    throw new VenueTimelineError("invalid_contract", "Token identity requires a contract address.");
  }
  const token = { chainId: input.chainId, contract: input.contract.toLowerCase() };
  const timeline: VenueTimeline["timeline"] = [];
  const latest = new Map<string, VenueState>();

  input.snapshots.forEach((snapshot, index) => {
    const ordered = [...snapshot].sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.venue.localeCompare(right.venue));
    for (const observation of ordered) {
      if (observation.chainId !== token.chainId || observation.contract.toLowerCase() !== token.contract) {
        continue;
      }
      const state: VenueState = observation.reachable && observation.state ? observation.state : "unknown";
      const previous = latest.get(observation.venue);
      if (previous !== state) {
        timeline.push({
          venue: observation.venue,
          from: previous ?? null,
          to: state,
          observedAt: observation.observedAt,
          source: `snapshot ${index + 1}`,
        });
        latest.set(observation.venue, state);
      }
    }
  });

  timeline.sort((left, right) => left.observedAt.localeCompare(right.observedAt) || left.venue.localeCompare(right.venue));
  return {
    token: { chainId: input.chainId, contract: input.contract.toLowerCase() },
    venues: [...latest.entries()].map(([venue, state]) => ({
      venue,
      state,
      source: timeline.filter((item) => item.venue === venue).at(-1)?.source ?? "none",
    })),
    timeline,
    coverage: "Venues are matched by chain and contract address. An unreachable venue stays unknown and is not treated as listed.",
  };
}
