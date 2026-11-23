import type { EvmDeployment } from "./assetRegistry";
import { StablecoinFlowError } from "./errors";
import { STABLECOIN_FLOW_LIMITS } from "./limits";
import type { RawEvmFlowEvent } from "./normalization";
import { deriveBlockRange, type ResolvedWindow } from "./windowing";

/** `Transfer(address,address,uint256)`. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const ZERO_TOPIC = `0x${"0".repeat(64)}`;

type JsonRpcResponse<T> = { result?: T; error?: { message?: string } };

type RawLog = {
  address?: string;
  topics?: string[];
  data?: string;
  blockNumber?: string;
  transactionHash?: string;
  logIndex?: string;
};

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(STABLECOIN_FLOW_LIMITS.timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`EVM provider answered ${response.status} for ${method}`);
  const payload = (await response.json()) as JsonRpcResponse<T>;
  if (payload.error) throw new Error(payload.error.message ?? `EVM provider rejected ${method}`);
  if (payload.result === undefined || payload.result === null) throw new Error(`EVM provider returned no result for ${method}`);
  return payload.result;
}

function hexToNumber(value: string | undefined, what: string): number {
  if (!value || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new StablecoinFlowError("malformed_response", `The provider returned no usable ${what}.`);
  }
  return Number(BigInt(value));
}

export type EvmReadResult = { events: RawEvmFlowEvent[]; truncated: boolean; coversWindowStart: boolean };

/**
 * Reads the zero-address `Transfer` logs of one token deployment inside a time
 * window: mints come from the zero address, burns go to it. The block range is
 * derived from the chain's nominal block time and then every event is checked
 * against the timestamp its own block reported, so a wrong block-time estimate
 * can only widen or narrow the scan — never mislabel an event's day.
 */
export async function readEvmFlowEvents(
  rpcUrl: string,
  deployment: EvmDeployment,
  window: ResolvedWindow,
): Promise<EvmReadResult> {
  const latestBlock = hexToNumber(await rpc<string>(rpcUrl, "eth_blockNumber", []), "latest block");
  const latestHeader = await rpc<{ timestamp?: string }>(rpcUrl, "eth_getBlockByNumber", [
    `0x${latestBlock.toString(16)}`,
    false,
  ]);
  const latestAt = new Date(hexToNumber(latestHeader.timestamp, "latest block timestamp") * 1000).toISOString();
  const range = deriveBlockRange(latestBlock, latestAt, deployment.secondsPerBlock, window);

  const logs: RawLog[] = [];
  let truncated = false;
  // Mints and burns are two separate log queries: the zero address is the
  // `from` topic of a mint and the `to` topic of a burn.
  const filters: Array<Array<string | null>> = [
    [TRANSFER_TOPIC, ZERO_TOPIC],
    [TRANSFER_TOPIC, null, ZERO_TOPIC],
  ];
  let from = range.fromBlock;
  for (let page = 0; page < STABLECOIN_FLOW_LIMITS.maxLogPages && from <= range.toBlock; page += 1) {
    const to = Math.min(from + STABLECOIN_FLOW_LIMITS.blocksPerLogPage - 1, range.toBlock);
    for (const topics of filters) {
      const rows = await rpc<RawLog[]>(rpcUrl, "eth_getLogs", [
        {
          address: deployment.address,
          topics,
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
        },
      ]);
      if (!Array.isArray(rows)) throw new StablecoinFlowError("malformed_response", "eth_getLogs did not return a list.");
      logs.push(...rows);
    }
    if (logs.length >= STABLECOIN_FLOW_LIMITS.maxEventsPerChain) {
      truncated = true;
      break;
    }
    from = to + 1;
  }

  const kept = logs.slice(0, STABLECOIN_FLOW_LIMITS.maxEventsPerChain);
  if (kept.length < logs.length) truncated = true;

  const blocks = [...new Set(kept.map((log) => hexToNumber(log.blockNumber, "log block number")))];
  if (blocks.length > STABLECOIN_FLOW_LIMITS.maxTimestampedBlocks) {
    truncated = true;
  }
  const timestamped = blocks.slice(0, STABLECOIN_FLOW_LIMITS.maxTimestampedBlocks);
  const timestamps = new Map<number, number>();
  for (const block of timestamped) {
    const header = await rpc<{ timestamp?: string }>(rpcUrl, "eth_getBlockByNumber", [`0x${block.toString(16)}`, false]);
    timestamps.set(block, hexToNumber(header.timestamp, `timestamp of block ${block}`));
  }

  const events: RawEvmFlowEvent[] = [];
  for (const log of kept) {
    if (log.address && log.address.toLowerCase() !== deployment.address) {
      throw new StablecoinFlowError("malformed_response", "A log was returned for another contract than the one requested.");
    }
    const topics = log.topics ?? [];
    if (topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const fromZero = topics[1]?.toLowerCase() === ZERO_TOPIC;
    const toZero = topics[2]?.toLowerCase() === ZERO_TOPIC;
    // A transfer from the zero address to the zero address is not a flow in
    // either direction; neither is any other transfer.
    if (fromZero === toZero) continue;
    const blockNumber = hexToNumber(log.blockNumber, "log block number");
    const blockTimestamp = timestamps.get(blockNumber);
    if (blockTimestamp === undefined) continue; // Beyond the timestamp budget; reported as truncated.
    events.push({
      direction: fromZero ? "mint" : "burn",
      amount: log.data ?? "0x0",
      blockNumber,
      blockTimestamp,
      txHash: log.transactionHash ?? "",
      logIndex: log.logIndex ? hexToNumber(log.logIndex, "log index") : 0,
    });
  }

  return { events, truncated, coversWindowStart: range.coversWindowStart };
}
