import { decodeEventLog, parseAbi, toEventSelector } from "viem";
import { DelegateParticipationError } from "./errors";
import { DELEGATE_LIMITS } from "./limits";
import { normalizeAddress } from "./governanceInput";
import type { DelegationMove, PowerCheckpoint } from "./schema";

/**
 * Topics are derived from the event signatures at load time rather than
 * written out as hashes, so there is no transcribed constant to drift.
 */
export const DELEGATION_TOPICS = {
  delegateChanged: toEventSelector("DelegateChanged(address,address,address)"),
  delegateVotesChanged: toEventSelector("DelegateVotesChanged(address,uint256,uint256)"),
} as const;

const DELEGATION_ABI = parseAbi([
  "event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate)",
  "event DelegateVotesChanged(address indexed delegate, uint256 previousBalance, uint256 newBalance)",
]);

export type RawLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
  logIndex?: string;
};

export type LogReader = (filter: {
  address: string;
  topics: Array<string | null>;
  fromBlock: number;
  toBlock: number;
}) => Promise<RawLog[]>;

export function hexToNumber(value: string | undefined, what: string): number {
  if (!value || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new DelegateParticipationError("malformed_response", `The provider returned no usable ${what}.`);
  }
  return Number(BigInt(value));
}

/** Pages a log filter across the range under the documented page budget. */
export async function readLogsPaged(
  read: LogReader,
  address: string,
  topics: Array<string | null>,
  fromBlock: number,
  toBlock: number,
  cap: number,
): Promise<{ logs: RawLog[]; truncated: boolean }> {
  const logs: RawLog[] = [];
  let truncated = false;
  let from = fromBlock;

  for (let page = 0; page < DELEGATE_LIMITS.maxLogPages && from <= toBlock; page += 1) {
    const to = Math.min(from + DELEGATE_LIMITS.blocksPerLogPage - 1, toBlock);
    const rows = await read({ address, topics, fromBlock: from, toBlock: to });
    if (!Array.isArray(rows)) {
      throw new DelegateParticipationError("malformed_response", "eth_getLogs did not return a list.");
    }
    logs.push(...rows);
    if (logs.length >= cap) {
      truncated = true;
      break;
    }
    from = to + 1;
    if (page === DELEGATE_LIMITS.maxLogPages - 1 && from <= toBlock) truncated = true;
  }

  return { logs: logs.slice(0, cap), truncated };
}

function decode(log: RawLog, eventName: "DelegateChanged" | "DelegateVotesChanged") {
  try {
    return decodeEventLog({
      abi: DELEGATION_ABI,
      eventName,
      data: (log.data ?? "0x") as `0x${string}`,
      topics: (log.topics ?? []) as [`0x${string}`, ...`0x${string}`[]],
    });
  } catch {
    throw new DelegateParticipationError("malformed_response", `A ${eventName} log could not be decoded.`);
  }
}

/**
 * Reads the governance token's delegation events: `DelegateVotesChanged`
 * carries each delegate's voting power after every change, and
 * `DelegateChanged` says which delegator moved power and to whom.
 */
export async function readDelegationEvents(
  read: LogReader,
  tokenAddress: string,
  fromBlock: number,
  toBlock: number,
): Promise<{ checkpoints: PowerCheckpoint[]; moves: DelegationMove[]; truncated: boolean }> {
  const votes = await readLogsPaged(
    read,
    tokenAddress,
    [DELEGATION_TOPICS.delegateVotesChanged],
    fromBlock,
    toBlock,
    DELEGATE_LIMITS.maxCheckpointsPerDelegate * DELEGATE_LIMITS.maxDelegates,
  );
  const changed = await readLogsPaged(
    read,
    tokenAddress,
    [DELEGATION_TOPICS.delegateChanged],
    fromBlock,
    toBlock,
    DELEGATE_LIMITS.maxCheckpointsPerDelegate * DELEGATE_LIMITS.maxDelegates,
  );

  const checkpoints = votes.logs.map((log) => {
    const decoded = decode(log, "DelegateVotesChanged");
    const args = decoded.args as { delegate: string; previousBalance: bigint; newBalance: bigint };
    return {
      delegate: normalizeAddress(args.delegate, "delegate address"),
      blockNumber: hexToNumber(log.blockNumber, "log block number"),
      previousPower: args.previousBalance.toString(),
      newPower: args.newBalance.toString(),
      deltaPower: (args.newBalance - args.previousBalance).toString(),
      txId: log.transactionHash ?? "",
      logIndex: log.logIndex ? hexToNumber(log.logIndex, "log index") : 0,
    };
  });

  const moves = changed.logs.map((log) => {
    const decoded = decode(log, "DelegateChanged");
    const args = decoded.args as { delegator: string; fromDelegate: string; toDelegate: string };
    return {
      delegator: normalizeAddress(args.delegator, "delegator address"),
      fromDelegate: normalizeAddress(args.fromDelegate, "previous delegate address"),
      toDelegate: normalizeAddress(args.toDelegate, "new delegate address"),
      blockNumber: hexToNumber(log.blockNumber, "log block number"),
      txId: log.transactionHash ?? "",
      logIndex: log.logIndex ? hexToNumber(log.logIndex, "log index") : 0,
    };
  });

  return { checkpoints, moves, truncated: votes.truncated || changed.truncated };
}
