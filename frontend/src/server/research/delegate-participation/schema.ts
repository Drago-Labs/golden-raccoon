import { z } from "zod";
import { DELEGATE_LIMITS } from "./limits";

const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

export const delegateParticipationRequestSchema = z
  .object({
    chain: z.string().trim().min(1).max(40),
    tokenAddress: address,
    governorAddress: address,
    /** Delegates to report on. Empty means the largest delegates seen in the range. */
    delegates: z.array(address).max(DELEGATE_LIMITS.maxDelegates).default([]),
    fromBlock: z.number().int().nonnegative().optional(),
    toBlock: z.number().int().nonnegative().optional(),
    /** How many of the largest delegation changes to rank. */
    topChanges: z.number().int().min(1).max(DELEGATE_LIMITS.maxRankedChanges).default(10),
  })
  .superRefine((value, ctx) => {
    if (value.fromBlock !== undefined && value.toBlock !== undefined && value.fromBlock > value.toBlock) {
      ctx.addIssue({ code: "custom", path: ["fromBlock"], message: "The block range must start at or before it ends." });
    }
  });

export type DelegateParticipationRequest = z.infer<typeof delegateParticipationRequestSchema>;

/** One `DelegateVotesChanged`: the delegate's voting power after the change. */
export type PowerCheckpoint = {
  delegate: string;
  blockNumber: number;
  previousPower: string;
  newPower: string;
  /** Signed change at this checkpoint. */
  deltaPower: string;
  txId: string;
  logIndex: number;
};

/** One `DelegateChanged`: which delegator moved power, and between whom. */
export type DelegationMove = {
  delegator: string;
  fromDelegate: string;
  toDelegate: string;
  blockNumber: number;
  txId: string;
  logIndex: number;
};

export type ProposalWindow = {
  proposalId: string;
  proposer: string;
  /** The block whose voting power decides eligibility (the governor's snapshot). */
  startBlock: number;
  endBlock: number;
  createdBlock: number;
  txId: string;
  txUrl: string;
  /** False when the proposal's voting window reaches past the scanned range. */
  fullyInRange: boolean;
};

export type VoteRecord = {
  proposalId: string;
  voter: string;
  support: number;
  weight: string;
  blockNumber: number;
  txId: string;
  txUrl: string;
};

export type DelegatePower = {
  blockNumber: number;
  powerUnits: string;
  deltaUnits: string;
  txId: string;
  txUrl: string;
};

export type DelegateRow = {
  address: string;
  /** Voting power at the end of the scanned range, or null when it is unknown. */
  currentPowerUnits: string | null;
  /** Largest power held at any checkpoint in the range. */
  peakPowerUnits: string | null;
  series: DelegatePower[];
  /** Proposals whose snapshot block found this delegate holding power. */
  eligibleProposals: string[];
  /** Of those, the ones the delegate voted on. */
  votedProposals: string[];
  /** Proposals whose eligibility could not be decided from the scanned range. */
  undeterminedProposals: string[];
  /** Voted ÷ eligible, in basis points, or null when no proposal was eligible. */
  participationBps: string | null;
  state: "complete" | "partial";
  notes: string[];
};

export type DelegationChange = {
  delegate: string;
  blockNumber: number;
  previousPowerUnits: string;
  newPowerUnits: string;
  deltaUnits: string;
  /** The delegators whose `DelegateChanged` events share this transaction. */
  delegators: string[];
  txId: string;
  txUrl: string;
};

export type DelegateParticipationReport = {
  state: "complete" | "partial" | "unavailable";
  governance: { chain: string; chainId: number; tokenAddress: string; governorAddress: string };
  range: { fromBlock: number; toBlock: number; coversHistory: boolean };
  delegates: DelegateRow[];
  proposals: ProposalWindow[];
  largestChanges: DelegationChange[];
  coverage: string[];
  readOnly: true;
};

export type DelegateParticipationResult =
  | { state: "ready"; report: DelegateParticipationReport }
  | { state: "unavailable"; report: DelegateParticipationReport; reason: string }
  /** The governor does not emit the Governor proposal and vote events this feature reads. */
  | { state: "unsupported_governor"; report: DelegateParticipationReport; reason: string };
