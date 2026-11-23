import { powerAt, type PowerSeries } from "./powerSeries";
import { settledProposals } from "./proposalWindows";
import type { ProposalWindow, VoteRecord } from "./schema";

export type ParticipationResult = {
  delegate: string;
  eligibleProposals: string[];
  votedProposals: string[];
  undeterminedProposals: string[];
  /** Voted ÷ eligible in basis points, or null when nothing was eligible. */
  participationBps: string | null;
  notes: string[];
};

/**
 * Participation is measured only over proposals the delegate could actually
 * vote on: the governor decides voting power at a proposal's snapshot block,
 * so a proposal counts for a delegate only when that delegate held power at
 * that block. Proposals still open at the end of the scanned range are left
 * out — a delegate who has not voted yet has not abstained — and proposals
 * whose snapshot is earlier than any checkpoint the range holds are reported
 * as undetermined rather than counted as a missed vote.
 */
export function measureParticipation(
  delegate: string,
  series: PowerSeries | undefined,
  proposals: ProposalWindow[],
  votes: VoteRecord[],
  range: { toBlock: number; coversHistory: boolean },
): ParticipationResult {
  const settled = settledProposals(proposals, range.toBlock);
  const votedIds = new Set(votes.filter((vote) => vote.voter === delegate).map((vote) => vote.proposalId));

  const eligibleProposals: string[] = [];
  const votedProposals: string[] = [];
  const undeterminedProposals: string[] = [];

  for (const proposal of settled) {
    const power = powerAt(series, proposal.startBlock, range.coversHistory);
    if (power === null) {
      undeterminedProposals.push(proposal.proposalId);
      continue;
    }
    if (power <= 0n) continue;
    eligibleProposals.push(proposal.proposalId);
    if (votedIds.has(proposal.proposalId)) votedProposals.push(proposal.proposalId);
  }

  const notes: string[] = [];
  const openProposals = proposals.length - settled.length;
  if (openProposals > 0) {
    notes.push(`${openProposals} proposal(s) were still open at the end of the scanned range and are not counted as missed votes.`);
  }
  if (undeterminedProposals.length) {
    notes.push(
      `${undeterminedProposals.length} proposal(s) have a snapshot block earlier than any checkpoint in the scanned range, so this delegate's power then is unknown and they are not counted either way.`,
    );
  }
  const votesOutsideEligibility = [...votedIds].filter((id) => !eligibleProposals.includes(id) && settled.some((proposal) => proposal.proposalId === id));
  if (votesOutsideEligibility.length) {
    notes.push(
      `${votesOutsideEligibility.length} recorded vote(s) belong to proposals this delegate was not found holding power at the snapshot of; they are reported but not counted in the rate.`,
    );
  }

  return {
    delegate,
    eligibleProposals,
    votedProposals,
    undeterminedProposals,
    participationBps: eligibleProposals.length
      ? ((BigInt(votedProposals.length) * 10_000n) / BigInt(eligibleProposals.length)).toString()
      : null,
    notes,
  };
}

/** The delegates to report on when the caller named none: the largest power seen in the range. */
export function largestDelegates(seriesByDelegate: Map<string, PowerSeries>, count: number): string[] {
  return [...seriesByDelegate.values()]
    .map((series) => ({
      delegate: series.delegate,
      peak: series.checkpoints.reduce((largest, checkpoint) => {
        const value = BigInt(checkpoint.newPower);
        return value > largest ? value : largest;
      }, 0n),
    }))
    .sort((left, right) => (right.peak === left.peak ? left.delegate.localeCompare(right.delegate) : right.peak > left.peak ? 1 : -1))
    .slice(0, count)
    .map((row) => row.delegate);
}
