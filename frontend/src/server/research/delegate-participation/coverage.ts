import type { DelegateRow, ProposalWindow } from "./schema";

/** Why one delegate's row is partial, in plain words. */
export function delegateNotes(input: {
  hasCheckpoints: boolean;
  truncatedSeries: boolean;
  undeterminedProposals: number;
  coversHistory: boolean;
  powerKnown: boolean;
}): { state: DelegateRow["state"]; notes: string[] } {
  const notes: string[] = [];
  if (!input.hasCheckpoints) {
    notes.push(
      input.coversHistory
        ? "This delegate has no delegation checkpoint in the scanned range, which covers the chain's history: they held no voting power."
        : "This delegate has no delegation checkpoint in the scanned range, so their voting power is unknown rather than zero.",
    );
  }
  if (input.truncatedSeries) {
    notes.push("This delegate has more checkpoints than this reader keeps, so the power series is incomplete.");
  }
  if (input.undeterminedProposals > 0) {
    notes.push("Some proposals could not be decided for this delegate, so the rate covers only the proposals that could.");
  }
  if (!input.powerKnown) {
    notes.push("Voting power at the end of the range could not be established from the scanned checkpoints.");
  }
  return { state: notes.length ? "partial" : "complete", notes };
}

/** What the report rests on and what it does not cover. */
export function reportCoverage(input: {
  delegates: DelegateRow[];
  proposals: ProposalWindow[];
  range: { fromBlock: number; toBlock: number; coversHistory: boolean };
  truncatedLogs: boolean;
  votesRead: number;
}): string[] {
  const notes = [
    "Voting power is read from the token's own DelegateVotesChanged checkpoints, each of which states the power a delegate holds after the change; no power is accumulated from deltas or inferred from balances.",
    "Participation counts only proposals whose snapshot block found the delegate holding power, and only proposals whose voting window had closed by the end of the scanned range.",
    `Scanned blocks ${input.range.fromBlock} to ${input.range.toBlock}: ${input.proposals.length} proposal(s) and ${input.votesRead} vote(s) were read.`,
  ];
  if (!input.range.coversHistory) {
    notes.push(
      "The scanned range does not reach the chain's start, so voting power before its first checkpoint is unknown rather than zero, and proposals that depend on it are reported as undetermined.",
    );
  }
  if (input.truncatedLogs) {
    notes.push("A provider page filled this reader's budget, so some events in the range are missing and every figure here is a floor.");
  }
  const partial = input.delegates.filter((delegate) => delegate.state !== "complete").map((delegate) => delegate.address);
  if (partial.length) {
    notes.push(`Partial evidence for: ${partial.join(", ")}.`);
  }
  const open = input.proposals.filter((proposal) => proposal.endBlock > input.range.toBlock);
  if (open.length) {
    notes.push(`${open.length} proposal(s) were still open at the end of the range and are excluded from every rate.`);
  }
  notes.push("This states what delegates did with the power they held. It does not rank, score or recommend delegates.");
  return notes;
}
