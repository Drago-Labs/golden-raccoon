import { DELEGATE_LIMITS } from "./limits";
import type { DelegationChange, DelegationMove, PowerCheckpoint } from "./schema";

/**
 * The largest single movements of voting power, ranked by the size of the
 * change regardless of direction, each keeping the transaction it came from.
 * The `DelegateChanged` events in the same transaction name the delegators
 * whose delegation moved, so a reader can see who moved the power and not
 * only that it moved.
 */
export function rankDelegationChanges(
  checkpoints: PowerCheckpoint[],
  moves: DelegationMove[],
  explorerTxUrl: string,
  count: number,
): DelegationChange[] {
  const limit = Math.min(Math.max(Math.trunc(count), 1), DELEGATE_LIMITS.maxRankedChanges);
  const delegatorsByTx = new Map<string, Set<string>>();
  for (const move of moves) {
    const key = `${move.txId}|${move.toDelegate}`;
    const fromKey = `${move.txId}|${move.fromDelegate}`;
    for (const mapKey of [key, fromKey]) {
      const set = delegatorsByTx.get(mapKey) ?? new Set<string>();
      set.add(move.delegator);
      delegatorsByTx.set(mapKey, set);
    }
  }

  const magnitude = (value: string) => {
    const delta = BigInt(value);
    return delta < 0n ? -delta : delta;
  };

  return [...checkpoints]
    .sort((left, right) => {
      const size = magnitude(right.deltaPower) - magnitude(left.deltaPower);
      if (size !== 0n) return size > 0n ? 1 : -1;
      return right.blockNumber - left.blockNumber || left.delegate.localeCompare(right.delegate);
    })
    .slice(0, limit)
    .map((checkpoint) => ({
      delegate: checkpoint.delegate,
      blockNumber: checkpoint.blockNumber,
      previousPowerUnits: checkpoint.previousPower,
      newPowerUnits: checkpoint.newPower,
      deltaUnits: checkpoint.deltaPower,
      delegators: [...(delegatorsByTx.get(`${checkpoint.txId}|${checkpoint.delegate}`) ?? new Set<string>())].sort(),
      txId: checkpoint.txId,
      txUrl: `${explorerTxUrl}${checkpoint.txId}`,
    }));
}
