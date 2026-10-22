import { FUNDING_SCAN_WINDOW_BLOCKS, MAX_FUNDING_HOPS, MAX_FUNDING_TRANSACTIONS_PER_HOP } from "./limits";
import type { DeployerRpc } from "./deployerLookup";
import type { FundingHop, FundingTransaction } from "./schema";

/**
 * Finds transactions that sent value to `address` in the blocks
 * immediately before `beforeBlock`, within a bounded window. Native
 * value transfers emit no logs, so this requires fetching full blocks —
 * the same cost tradeoff as `deploymentScan.ts`, with the same
 * deliberately narrow window.
 */
async function findIncomingValueTransactions(
  rpc: DeployerRpc,
  address: string,
  beforeBlock: bigint,
  windowBlocks: bigint,
): Promise<FundingTransaction[]> {
  const fromBlock = beforeBlock > windowBlocks ? beforeBlock - windowBlocks : 0n;
  const toBlock = beforeBlock > 0n ? beforeBlock - 1n : 0n;
  if (toBlock < fromBlock) return [];

  const blockNumbers: bigint[] = [];
  for (let b = fromBlock; b <= toBlock; b += 1n) blockNumbers.push(b);

  const blocks = await Promise.all(blockNumbers.map((b) => rpc.getBlock(b)));
  const target = address.toLowerCase();
  const found: FundingTransaction[] = [];

  for (const block of blocks) {
    if (!block) continue;
    for (const tx of block.transactions) {
      if (!tx.to || tx.to.toLowerCase() !== target) continue;
      if (BigInt(tx.value) <= 0n) continue;
      found.push({ from: tx.from, to: tx.to, blockNumber: block.number, txHash: tx.hash, valueWei: tx.value });
    }
  }

  return found.sort((a, b) => a.blockNumber - b.blockNumber);
}

/**
 * Walks `deployer <- funder <- funder's funder <- ...` for up to
 * `maxHops`, stopping early once a hop has no incoming value transfers
 * in its window, and never revisiting an address (breaks funding
 * cycles rather than looping forever).
 */
export async function traceFundingTrail(
  rpc: DeployerRpc,
  deployer: string,
  beforeBlock: bigint,
  maxHops: number = MAX_FUNDING_HOPS,
  windowBlocks: bigint = FUNDING_SCAN_WINDOW_BLOCKS,
): Promise<FundingHop[]> {
  const hops: FundingHop[] = [];
  const visited = new Set<string>([deployer.toLowerCase()]);
  let current = deployer;
  let cursor = beforeBlock;

  for (let hop = 1; hop <= maxHops; hop += 1) {
    const transactions = await findIncomingValueTransactions(rpc, current, cursor, windowBlocks);
    const capped = transactions.slice(0, MAX_FUNDING_TRANSACTIONS_PER_HOP);
    hops.push({ hop, address: current, transactions: capped });

    if (capped.length === 0) break;
    const next = capped[0].from;
    if (visited.has(next.toLowerCase())) break;
    visited.add(next.toLowerCase());
    current = next;
    cursor = BigInt(capped[0].blockNumber);
  }

  return hops;
}
