import type { ProposalWindow } from "./schema";

/**
 * The proposals whose voting window overlaps the scanned range. A proposal
 * created before the range but still open inside it counts: the delegate could
 * have voted during the range. A proposal is marked `fullyInRange` only when
 * both its snapshot and its close are inside what was actually read.
 */
export function proposalsInRange(proposals: ProposalWindow[], fromBlock: number, toBlock: number): ProposalWindow[] {
  return proposals
    .filter((proposal) => proposal.startBlock <= toBlock && proposal.endBlock >= fromBlock)
    .sort((left, right) => left.startBlock - right.startBlock || left.proposalId.localeCompare(right.proposalId));
}

/** Whether a proposal's voting window had closed by the end of the scanned range. */
export function closedByEndOfRange(proposal: ProposalWindow, toBlock: number): boolean {
  return proposal.endBlock <= toBlock;
}

/**
 * Proposals still open at the end of the range are excluded from a
 * participation rate: a delegate who has not voted yet has not abstained.
 */
export function settledProposals(proposals: ProposalWindow[], toBlock: number): ProposalWindow[] {
  return proposals.filter((proposal) => closedByEndOfRange(proposal, toBlock));
}
