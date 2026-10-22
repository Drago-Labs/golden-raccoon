import { PRICE_JUMP_THRESHOLD_BPS, PRICE_SAMPLE_POINTS, PRICE_SAMPLE_WINDOW_BLOCKS, SHARE_PRICE_SCALE } from "./limits";
import type { SharePriceJump, SharePricePoint } from "./schema";

const BASIS_POINTS_SCALE = 10_000n;

/**
 * Evenly spaced block numbers covering the sample window ending at
 * `endBlock`, oldest first. Never goes below block 0, so a chain younger
 * than the window still returns a valid (shorter) set of points.
 */
export function planSampleBlocks(endBlock: bigint, points = PRICE_SAMPLE_POINTS, windowBlocks = PRICE_SAMPLE_WINDOW_BLOCKS): bigint[] {
  if (points <= 1) return [endBlock];
  const startBlock = endBlock > windowBlocks ? endBlock - windowBlocks : 0n;
  const span = endBlock - startBlock;
  const blocks: bigint[] = [];
  for (let i = 0; i < points; i += 1) {
    const offset = (span * BigInt(i)) / BigInt(points - 1);
    blocks.push(startBlock + offset);
  }
  // De-duplicate (a short span can collapse adjacent offsets onto the same block).
  return [...new Set(blocks)];
}

/**
 * Flags consecutive sample pairs whose assets-per-share ratio moved by at
 * least `thresholdBps`, in either direction. Points with no price (an
 * unavailable read) are skipped rather than treated as a 100% move.
 */
export function detectJumps(points: SharePricePoint[], thresholdBps = PRICE_JUMP_THRESHOLD_BPS): SharePriceJump[] {
  const jumps: SharePriceJump[] = [];
  const priced = points.filter((p): p is SharePricePoint & { sharePrice: NonNullable<SharePricePoint["sharePrice"]> } => p.sharePrice !== null);

  for (let i = 1; i < priced.length; i += 1) {
    const previous = BigInt(priced[i - 1].sharePrice.assetsPerShareScaled);
    const current = BigInt(priced[i].sharePrice.assetsPerShareScaled);
    if (previous <= 0n) continue;

    const diff = current > previous ? current - previous : previous - current;
    const changeBps = Number((diff * BASIS_POINTS_SCALE) / previous);
    if (changeBps >= thresholdBps) {
      jumps.push({ fromBlock: priced[i - 1].blockNumber, toBlock: priced[i].blockNumber, changeBps });
    }
  }

  return jumps;
}

/** Kept for callers that want to sanity-check a scale invariant without re-importing `limits.ts`. */
export const PRICE_SCALE = SHARE_PRICE_SCALE;
