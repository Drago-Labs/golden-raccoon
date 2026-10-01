export class GovernanceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "GovernanceError";
    this.code = code;
  }
}

export type Support = "for" | "against" | "abstain";

export interface VoteEvent {
  proposalId: string;
  voter: string;
  support: Support;
  weight: number;
  tx: string;
  logIndex: number;
}

export interface CallAbi {
  selector: string;
  name: string;
}

export interface ProposalInput {
  id: string;
  state: string;
  quorum: number;
  executed?: boolean;
  calldata?: string;
  abi?: CallAbi[];
}

export interface GovernorInput {
  variant: string;
  governor: string;
  truncated?: boolean;
  proposals: ProposalInput[];
  votePages: VoteEvent[][];
}

const SUPPORTED = new Set(["oz-governor", "compound-bravo"]);

export function assertGovernorAddress(value: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new GovernanceError("invalid_address", "Governor address must be a 20-byte hex address.");
  }
}

function decodeCall(calldata: string | undefined, abi: CallAbi[] | undefined) {
  if (!calldata) return null;
  const selector = calldata.slice(0, 10).toLowerCase();
  const known = abi?.find((entry) => entry.selector.toLowerCase() === selector);
  if (!known) return { form: "raw" as const, calldata };
  return { form: "decoded" as const, name: known.name, calldata };
}

export function summarizeGovernance(input: GovernorInput) {
  if (!SUPPORTED.has(input.variant)) {
    return {
      status: "unsupported" as const,
      proposals: [] as const,
      coverage: "Unsupported governor variant. Results are not an empty history.",
    };
  }

  const seen = new Set<string>();
  const votes: VoteEvent[] = [];
  for (const page of input.votePages ?? []) {
    for (const vote of page) {
      const key = `${vote.tx}:${vote.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      votes.push(vote);
    }
  }

  const proposals = input.proposals.map((proposal) => {
    const related = votes.filter((vote) => vote.proposalId === proposal.id);
    const split = { for: 0, against: 0, abstain: 0 };
    for (const vote of related) split[vote.support] += vote.weight;
    const decisive = related
      .filter((vote) => vote.support !== "abstain")
      .slice()
      .sort((a, b) => b.weight - a.weight);
    const decisiveTotal = split.for + split.against;
    let running = 0;
    let nakamoto = 0;
    for (const vote of decisive) {
      running += vote.weight;
      nakamoto += 1;
      if (decisiveTotal > 0 && running * 2 > decisiveTotal) break;
    }
    const top = decisive.slice(0, 3);
    const topWeight = top.reduce((sum, vote) => sum + vote.weight, 0);
    return {
      id: proposal.id,
      state: proposal.state,
      quorum: proposal.quorum,
      quorumMargin: split.for - proposal.quorum,
      split,
      topVoterShare: decisiveTotal === 0 ? 0 : topWeight / decisiveTotal,
      nakamoto,
      call: proposal.executed ? decodeCall(proposal.calldata, proposal.abi) : null,
    };
  });

  return {
    status: "ok" as const,
    proposals,
    coverage: input.truncated
      ? "Vote history is partial. Totals cover only the pages that were read."
      : "Pinned blocks only. This page does not vote or delegate.",
  };
}
