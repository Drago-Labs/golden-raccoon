/**
 * Clock provider function returning current timestamp in milliseconds.
 */
export type ClockProvider = () => number;

/**
 * Manages cooperative wall-clock deadlines and associated AbortSignal lifecycle.
 */
export class DeadlineController {
  private abortController: AbortController;
  private startTime: number;
  private deadlineMs: number;
  private timer?: NodeJS.Timeout;
  private clock: ClockProvider;
  private expired = false;

  constructor(deadlineMs: number, clock: ClockProvider = Date.now) {
    this.abortController = new AbortController();
    this.clock = clock;
    this.startTime = this.clock();
    this.deadlineMs = deadlineMs;

    if (deadlineMs > 0 && typeof setTimeout !== "undefined") {
      this.timer = setTimeout(() => {
        this.triggerExpiry("Wall-clock deadline expired");
      }, deadlineMs);
      if (typeof this.timer.unref === "function") {
        this.timer.unref();
      }
    }
  }

  /**
   * Retrieves the remaining milliseconds before the deadline elapses.
   */
  get remainingMs(): number {
    if (this.expired || this.abortController.signal.aborted) {
      return 0;
    }
    const elapsed = this.clock() - this.startTime;
    return Math.max(0, this.deadlineMs - elapsed);
  }

  /**
   * Retrieves the remaining milliseconds before the deadline elapses.
   */
  getRemainingMs(): number {
    return this.remainingMs;
  }

  /**
   * Indicates whether the deadline has elapsed or been aborted.
   */
  get isExpired(): boolean {
    if (this.expired || this.abortController.signal.aborted) {
      return true;
    }
    if (this.remainingMs <= 0) {
      this.triggerExpiry("Wall-clock deadline expired");
      return true;
    }
    return false;
  }

  /**
   * Returns the AbortSignal tied to this deadline.
   */
  get signal(): AbortSignal {
    if (!this.expired && this.remainingMs <= 0) {
      this.triggerExpiry("Wall-clock deadline expired");
    }
    return this.abortController.signal;
  }

  /**
   * Triggers expiration explicitly with a reason.
   *
   * @param reason Description of why the deadline terminated.
   */
  triggerExpiry(reason = "Wall-clock deadline expired"): void {
    if (this.expired) {
      return;
    }
    this.expired = true;
    if (!this.abortController.signal.aborted) {
      this.abortController.abort(new Error(reason));
    }
    this.cleanup();
  }

  /**
   * Clears active timeout timers.
   */
  cleanup(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
