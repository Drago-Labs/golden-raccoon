import { decodeEventLog, parseAbi, toEventSelector } from "viem";
import { DelegateParticipationError } from "./errors";
import { DELEGATE_LIMITS } from "./limits";
import { normalizeAddress } from "./governanceInput";
import { hexToNumber, readLogsPaged, type LogReader, type RawLog } from "./delegationEvents";
import type { ProposalWindow, VoteRecord } from "./schema";

export const GOVERNOR_TOPICS = {
  proposalCreated: toEventSelector(
    "ProposalCreated(uint256,address,address[],uint256[],string[],bytes[],uint256,uint256,string)",
  ),
  voteCast: toEventSelector("VoteCast(address,uint256,uint8,uint256,string)"),
} as const;

const GOVERNOR_ABI = parseAbi([
  "event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 voteStart, uint256 voteEnd, string description)",
  "event VoteCast(address indexed voter, uint256 proposalId, uint8 support, uint256 weight, string reason)",
]);

/** Reads the governor's own bytecode, so an address with no contract is not read as a silent zero. */
export type CodeReader = (address: string) => Promise<string>;

export type GovernorRead = {
  proposals: ProposalWindow[];
  votes: VoteRecord[];
  truncated: boolean;
};

/**
 * Reads the governor's proposals and votes. A governor that this feature
 * cannot read is never reported as "no participation": an address with no
 * contract, or one whose proposal logs do not decode under the Governor event
 * signatures, raises `unsupported_governor` instead.
 */
export async function readGovernorActivity(
  read: LogReader,
  readCode: CodeReader,
  governorAddress: string,
  explorerTxUrl: string,
  fromBlock: number,
  toBlock: number,
): Promise<GovernorRead> {
  const code = await readCode(governorAddress);
  if (!code || code === "0x" || code === "0x0") {
    throw new DelegateParticipationError(
      "unsupported_governor",
      `${governorAddress} holds no contract code on this chain, so it has no governor events to read.`,
    );
  }

  const created = await readLogsPaged(
    read,
    governorAddress,
    [GOVERNOR_TOPICS.proposalCreated],
    fromBlock,
    toBlock,
    DELEGATE_LIMITS.maxProposals,
  );
  const cast = await readLogsPaged(
    read,
    governorAddress,
    [GOVERNOR_TOPICS.voteCast],
    fromBlock,
    toBlock,
    DELEGATE_LIMITS.maxVotes,
  );

  const proposals = decodeProposals(created.logs, explorerTxUrl, fromBlock, toBlock);
  const votes = decodeVotes(cast.logs, explorerTxUrl);

  return { proposals, votes, truncated: created.truncated || cast.truncated };
}

function decodeProposals(logs: RawLog[], explorerTxUrl: string, fromBlock: number, toBlock: number): ProposalWindow[] {
  const proposals: ProposalWindow[] = [];
  let undecodable = 0;

  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: GOVERNOR_ABI,
        eventName: "ProposalCreated",
        data: (log.data ?? "0x") as `0x${string}`,
        topics: (log.topics ?? []) as [`0x${string}`, ...`0x${string}`[]],
      });
      const args = decoded.args as {
        proposalId: bigint;
        proposer: string;
        voteStart: bigint;
        voteEnd: bigint;
      };
      const startBlock = Number(args.voteStart);
      const endBlock = Number(args.voteEnd);
      proposals.push({
        proposalId: args.proposalId.toString(),
        proposer: normalizeAddress(args.proposer, "proposer address"),
        startBlock,
        endBlock,
        createdBlock: hexToNumber(log.blockNumber, "log block number"),
        txId: log.transactionHash ?? "",
        txUrl: `${explorerTxUrl}${log.transactionHash ?? ""}`,
        fullyInRange: startBlock >= fromBlock && endBlock <= toBlock,
      });
    } catch {
      undecodable += 1;
    }
  }

  // Logs carrying the Governor topic that none of them decodes under the
  // Governor signature means this is a different governor shape, not a
  // governor without proposals.
  if (logs.length > 0 && proposals.length === 0 && undecodable === logs.length) {
    throw new DelegateParticipationError(
      "unsupported_governor",
      "The governor's proposal logs do not match the Governor ProposalCreated event this feature reads.",
    );
  }

  return proposals.sort((left, right) => left.startBlock - right.startBlock || left.proposalId.localeCompare(right.proposalId));
}

function decodeVotes(logs: RawLog[], explorerTxUrl: string): VoteRecord[] {
  return logs.flatMap((log) => {
    try {
      const decoded = decodeEventLog({
        abi: GOVERNOR_ABI,
        eventName: "VoteCast",
        data: (log.data ?? "0x") as `0x${string}`,
        topics: (log.topics ?? []) as [`0x${string}`, ...`0x${string}`[]],
      });
      const args = decoded.args as { voter: string; proposalId: bigint; support: number; weight: bigint };
      return [
        {
          proposalId: args.proposalId.toString(),
          voter: normalizeAddress(args.voter, "voter address"),
          support: Number(args.support),
          weight: args.weight.toString(),
          blockNumber: hexToNumber(log.blockNumber, "log block number"),
          txId: log.transactionHash ?? "",
          txUrl: `${explorerTxUrl}${log.transactionHash ?? ""}`,
        },
      ];
    } catch {
      // A vote log this feature cannot decode is left out rather than counted
      // as a vote for an unknown proposal.
      return [];
    }
  });
}
