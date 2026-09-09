import { StellarDataLayerError } from "../errors";

export class RequestBudget {
  readonly totalBudgetMs: number;
  readonly startedAt: number;
  private readonly now: () => number;

  constructor(options: {
    totalBudgetMs?: number;
    startedAt?: number;
    now?: () => number;
  } = {}) {
    this.now = options.now ?? Date.now;
    this.startedAt = options.startedAt ?? this.now();
    this.totalBudgetMs = Math.max(1, options.totalBudgetMs ?? 8_000);
  }

  /**
   * Computes the milliseconds remaining before the total budget deadline expires.
   */
  remainingMs(nowTime?: number): number {
    const current = nowTime ?? this.now();
    const elapsed = Math.max(0, current - this.startedAt);
    return Math.max(0, this.totalBudgetMs - elapsed);
  }

  /**
   * Checks whether the total budget has been exhausted.
   */
  isExhausted(nowTime?: number): boolean {
    return this.remainingMs(nowTime) <= 0;
  }

  /**
   * Asserts that budget remains. Throws a timeout StellarDataLayerError if exhausted.
   */
  assertBudgetRemaining(nowTime?: number): void {
    if (this.remainingMs(nowTime) <= 0) {
      throw new StellarDataLayerError(
        "timeout",
        `Request budget exceeded (${this.totalBudgetMs}ms total budget exhausted).`,
        true,
      );
    }
  }

  /**
   * Alias for assertBudgetRemaining.
   */
  assertNotExhausted(nowTime?: number): void {
    this.assertBudgetRemaining(nowTime);
  }

  /**
   * Allocates a timeout duration for an individual attempt bounded by remaining total budget.
   *
   * @param maxAttemptTimeoutMs Preferred maximum timeout for an individual attempt
   * @param nowTime Optional explicit current timestamp
   * @returns Time in milliseconds bounded by the remaining request budget
   */
  allocateAttemptTimeout(maxAttemptTimeoutMs?: number, nowTime?: number): number {
    const remaining = this.remainingMs(nowTime);
    if (remaining <= 0) {
      return 0;
    }
    if (maxAttemptTimeoutMs !== undefined && maxAttemptTimeoutMs > 0) {
      return Math.min(maxAttemptTimeoutMs, remaining);
    }
    return remaining;
  }

  /**
   * Returns total elapsed time in milliseconds since budget creation.
   */
  elapsedMs(nowTime?: number): number {
    return Math.max(0, (nowTime ?? this.now()) - this.startedAt);
  }
}

/**
 * Executes an async operation with timeout bounded by the request budget.
 *
 * @param operation Action receiving an AbortSignal
 * @param budget Active RequestBudget instance
 * @param maxAttemptTimeoutMs Optional cap on attempt duration
 * @param parentSignal Optional outer cancellation signal or label
 */
export async function withBudgetTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  budget: RequestBudget,
  maxAttemptTimeoutMs?: number,
  parentSignal?: AbortSignal | string,
): Promise<T> {
  const timeoutMs = budget.allocateAttemptTimeout(maxAttemptTimeoutMs);
  const controller = new AbortController();

  const isSignal = Boolean(
    parentSignal && typeof (parentSignal as { addEventListener?: unknown }).addEventListener === "function",
  );

  const handleParentAbort = () => {
    controller.abort((parentSignal as AbortSignal)?.reason);
  };
  if (isSignal) {
    (parentSignal as AbortSignal).addEventListener("abort", handleParentAbort, { once: true });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new StellarDataLayerError(
          "timeout",
          `Operation attempt timed out after ${timeoutMs}ms (budget remaining: 0ms).`,
          true,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (isSignal) {
      (parentSignal as AbortSignal).removeEventListener("abort", handleParentAbort);
    }
  }
}
