import { getEvmNetwork } from "@/lib/evm/config";
import { DelegateParticipationError } from "./errors";
import { DELEGATE_LIMITS } from "./limits";

/** An EVM address, lower-cased so one account has exactly one identity. */
export function normalizeAddress(value: string, what: string): string {
  const text = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(text)) {
    throw new DelegateParticipationError("invalid_request", `"${value}" is not a usable ${what}.`);
  }
  return text.toLowerCase();
}

export type GovernanceIdentity = {
  chain: string;
  chainId: number;
  /** The ERC-20 votes token whose delegation events are read. */
  tokenAddress: string;
  /** The governor whose proposals and votes are read. */
  governorAddress: string;
  delegates: string[];
  explorerTxUrl: string;
};

/**
 * Resolves the governance identity to read. Only chains the repository already
 * configures are accepted, and the token and governor must be different
 * contracts — reading one as the other would silently produce an empty report.
 */
export function resolveGovernance(input: {
  chain: string;
  tokenAddress: string;
  governorAddress: string;
  delegates: string[];
}): GovernanceIdentity {
  const network = getEvmNetwork(input.chain);
  if (!network) {
    throw new DelegateParticipationError("invalid_request", `"${input.chain}" is not a configured EVM network.`);
  }
  const tokenAddress = normalizeAddress(input.tokenAddress, "governance token address");
  const governorAddress = normalizeAddress(input.governorAddress, "governor address");
  if (tokenAddress === governorAddress) {
    throw new DelegateParticipationError("invalid_request", "The governance token and the governor cannot be the same contract.");
  }
  if (input.delegates.length > DELEGATE_LIMITS.maxDelegates) {
    throw new DelegateParticipationError("invalid_request", `At most ${DELEGATE_LIMITS.maxDelegates} delegates may be named.`);
  }
  const delegates = input.delegates.map((delegate) => normalizeAddress(delegate, "delegate address"));
  if (new Set(delegates).size !== delegates.length) {
    throw new DelegateParticipationError("invalid_request", "Each delegate may be named only once.");
  }
  return {
    chain: network.id,
    chainId: network.chainId,
    tokenAddress,
    governorAddress,
    delegates,
    explorerTxUrl: `${network.explorerUrl.replace(/\/$/, "")}/tx/`,
  };
}

export type BlockRange = { fromBlock: number; toBlock: number; coversHistory: boolean };

/**
 * The block range to scan. `coversHistory` says whether the range reaches
 * block zero: when it does not, a delegate's voting power before the first
 * checkpoint inside the range is unknown rather than zero, and that is
 * reported instead of assumed.
 */
export function resolveRange(latestBlock: number, fromBlock?: number, toBlock?: number): BlockRange {
  if (!Number.isInteger(latestBlock) || latestBlock < 0) {
    throw new DelegateParticipationError("malformed_response", "The provider did not report a usable latest block.");
  }
  const end = Math.min(toBlock ?? latestBlock, latestBlock);
  const start = Math.max(fromBlock ?? Math.max(end - DELEGATE_LIMITS.maxBlockSpan + 1, 0), 0);
  if (start > end) {
    throw new DelegateParticipationError("invalid_request", "The block range must start at or before it ends.");
  }
  if (end - start + 1 > DELEGATE_LIMITS.maxBlockSpan) {
    throw new DelegateParticipationError(
      "invalid_request",
      `A range may cover at most ${DELEGATE_LIMITS.maxBlockSpan} blocks. Narrow the range.`,
    );
  }
  return { fromBlock: start, toBlock: end, coversHistory: start === 0 };
}
