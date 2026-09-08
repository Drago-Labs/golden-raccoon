/**
 * Deterministic pseudo-random number generator (Mulberry32)
 */
export class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextBigInt(min: bigint, max: bigint): bigint {
    if (min === max) return min;
    const diff = max - min;
    const factor = BigInt(Math.floor(this.next() * 1000000));
    return min + (diff * factor) / 1000000n;
  }

  pick<T>(items: T[]): T {
    const idx = this.nextInt(0, items.length - 1);
    return items[idx];
  }
}

export type VaultAction =
  | { type: "deposit"; userIndex: number; amount: bigint }
  | { type: "withdraw"; userIndex: number; amount: bigint; replayIntent?: boolean };

export type PolicyAction =
  | { type: "applyPolicy"; userIndex: number; maxTx: bigint; slippage: bigint; duration: number }
  | { type: "createIntent"; userIndex: number; amount: bigint; slippage: bigint; duration: number }
  | { type: "executeIntent"; userIndex: number; replay?: boolean }
  | { type: "revokePolicy"; userIndex: number; callerIndex: number }
  | { type: "pause"; callerIndex: number }
  | { type: "unpause"; callerIndex: number };

export type AuditAction =
  | { type: "setPolicy"; userIndex: number }
  | { type: "authorizeAgent"; userIndex: number; windowSec: number }
  | { type: "revokeAgent"; userIndex: number }
  | { type: "logDecision"; userIndex: number; buyRisk: number }
  | { type: "recordIntent"; userIndex: number; windowSec: number; replayId?: boolean }
  | { type: "setPaused"; userIndex: number; paused: boolean };

export interface ActionTrace<T> {
  seed: number;
  steps: T[];
}

/**
 * Generate randomized trace of vault actions
 */
export function generateVaultActions(
  seed: number,
  stepCount: number,
  userCount: number
): ActionTrace<VaultAction> {
  const rng = new DeterministicRandom(seed);
  const steps: VaultAction[] = [];

  for (let i = 0; i < stepCount; i++) {
    const isDeposit = rng.next() < 0.55;
    const userIndex = rng.nextInt(0, userCount - 1);
    if (isDeposit) {
      const amount = rng.nextBigInt(1n, 1000n * 10n ** 18n);
      steps.push({ type: "deposit", userIndex, amount });
    } else {
      const amount = rng.nextBigInt(1n, 500n * 10n ** 18n);
      const replayIntent = rng.next() < 0.1;
      steps.push({ type: "withdraw", userIndex, amount, replayIntent });
    }
  }

  return { seed, steps };
}

/**
 * Generate randomized trace of policy actions
 */
export function generatePolicyActions(
  seed: number,
  stepCount: number,
  userCount: number
): ActionTrace<PolicyAction> {
  const rng = new DeterministicRandom(seed);
  const steps: PolicyAction[] = [];

  for (let i = 0; i < stepCount; i++) {
    const roll = rng.next();
    const userIndex = rng.nextInt(0, userCount - 1);
    if (roll < 0.3) {
      steps.push({
        type: "applyPolicy",
        userIndex,
        maxTx: rng.nextBigInt(100n * 10n ** 18n, 1000n * 10n ** 18n),
        slippage: BigInt(rng.nextInt(50, 1000)),
        duration: rng.nextInt(3600, 86400),
      });
    } else if (roll < 0.6) {
      steps.push({
        type: "createIntent",
        userIndex,
        amount: rng.nextBigInt(1n * 10n ** 18n, 500n * 10n ** 18n),
        slippage: BigInt(rng.nextInt(10, 500)),
        duration: rng.nextInt(60, 1800),
      });
    } else if (roll < 0.8) {
      steps.push({
        type: "executeIntent",
        userIndex,
        replay: rng.next() < 0.1,
      });
    } else if (roll < 0.9) {
      steps.push({
        type: "revokePolicy",
        userIndex,
        callerIndex: rng.nextInt(0, 3),
      });
    } else {
      steps.push(
        rng.next() < 0.5
          ? { type: "pause", callerIndex: rng.nextInt(0, 3) }
          : { type: "unpause", callerIndex: rng.nextInt(0, 3) }
      );
    }
  }

  return { seed, steps };
}

/**
 * Generate randomized trace of audit actions
 */
export function generateAuditActions(
  seed: number,
  stepCount: number,
  userCount: number
): ActionTrace<AuditAction> {
  const rng = new DeterministicRandom(seed);
  const steps: AuditAction[] = [];

  for (let i = 0; i < stepCount; i++) {
    const roll = rng.next();
    const userIndex = rng.nextInt(0, userCount - 1);
    if (roll < 0.25) {
      steps.push({ type: "setPolicy", userIndex });
    } else if (roll < 0.45) {
      steps.push({
        type: "authorizeAgent",
        userIndex,
        windowSec: rng.nextInt(3600, 86400 * 30),
      });
    } else if (roll < 0.65) {
      steps.push({
        type: "logDecision",
        userIndex,
        buyRisk: rng.nextInt(0, 100),
      });
    } else if (roll < 0.85) {
      steps.push({
        type: "recordIntent",
        userIndex,
        windowSec: rng.nextInt(60, 1800),
        replayId: rng.next() < 0.1,
      });
    } else if (roll < 0.95) {
      steps.push({
        type: "setPaused",
        userIndex,
        paused: rng.next() < 0.5,
      });
    } else {
      steps.push({ type: "revokeAgent", userIndex });
    }
  }

  return { seed, steps };
}
