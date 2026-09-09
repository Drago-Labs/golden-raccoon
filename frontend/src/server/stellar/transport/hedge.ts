import { StellarDataLayerError } from "../errors";
import { RequestBudget, withBudgetTimeout } from "./budget";

export type HedgedResult<T> = {
  value: T;
  winnerUrl: string;
  hedgedDispatched: boolean;
  durationMs: number;
};

export type HedgedExecutionOptions<T> = {
  hedgeDelayMs?: number;
  maxAttemptTimeoutMs?: number;
  budget?: RequestBudget;
  parentSignal?: AbortSignal;
  validateSoundness?: (value: T) => boolean;
  now?: () => number;
};

/**
 * Executes an idempotent operation with hedged speculative dispatch to a backup endpoint.
 * Dispatches to primary endpoint first. If primary does not answer within hedgeDelayMs,
 * dispatches secondary request to backup endpoint. Takes first sound response and cancels
 * the slower attempt via AbortController.
 *
 * @param primaryUrl First-priority endpoint URL
 * @param secondaryUrl Optional backup endpoint URL
 * @param operation Idempotent async function accepting an endpoint URL and AbortSignal
 * @param options Timing, budget, and validation options
 * @returns Result from the winning endpoint with execution metadata
 */
export async function hedgedExecute<T>(
  primaryUrl: string,
  secondaryUrl: string | undefined,
  operation: (endpointUrl: string, signal: AbortSignal) => Promise<T>,
  options: HedgedExecutionOptions<T> = {},
): Promise<HedgedResult<T>> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const hedgeDelayMs = Math.max(10, options.hedgeDelayMs ?? 200);
  const budget = options.budget ?? new RequestBudget({ now });

  const primaryController = new AbortController();
  const secondaryController = new AbortController();

  const handleParentAbort = () => {
    primaryController.abort(options.parentSignal?.reason);
    secondaryController.abort(options.parentSignal?.reason);
  };
  options.parentSignal?.addEventListener("abort", handleParentAbort, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let hedgedDispatched = false;

  try {
    const runPrimary = async (): Promise<{ value: T; winnerUrl: string }> => {
      const val = await withBudgetTimeout(
        (signal) => operation(primaryUrl, signal),
        budget,
        options.maxAttemptTimeoutMs,
        primaryController.signal,
      );
      if (options.validateSoundness && !options.validateSoundness(val)) {
        throw new StellarDataLayerError("malformed_response", "Primary response failed soundness check.", true);
      }
      return { value: val, winnerUrl: primaryUrl };
    };

    if (!secondaryUrl) {
      const result = await runPrimary();
      return {
        value: result.value,
        winnerUrl: result.winnerUrl,
        hedgedDispatched: false,
        durationMs: Math.max(0, now() - startedAt),
      };
    }

    const primaryPromise = runPrimary();

    const hedgeTrigger = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        resolve();
      }, hedgeDelayMs);
    });

    const runSecondary = async (): Promise<{ value: T; winnerUrl: string }> => {
      await hedgeTrigger;
      hedgedDispatched = true;
      const val = await withBudgetTimeout(
        (signal) => operation(secondaryUrl, signal),
        budget,
        options.maxAttemptTimeoutMs,
        secondaryController.signal,
      );
      if (options.validateSoundness && !options.validateSoundness(val)) {
        throw new StellarDataLayerError("malformed_response", "Secondary response failed soundness check.", true);
      }
      return { value: val, winnerUrl: secondaryUrl };
    };

    const secondaryPromise = runSecondary();

    const winner = await new Promise<{ value: T; winnerUrl: string }>((resolve, reject) => {
      let settled = false;
      let primaryError: unknown;
      let secondaryError: unknown;
      let secondaryStarted = false;

      void hedgeTrigger.then(() => {
        secondaryStarted = true;
      });

      primaryPromise
        .then((res) => {
          if (!settled) {
            settled = true;
            secondaryController.abort("cancelled_by_winner");
            resolve(res);
          }
        })
        .catch((err) => {
          primaryError = err;
          if (settled) return;
          if (secondaryError || !secondaryStarted) {
            if (secondaryStarted && secondaryError) {
              settled = true;
              reject(err);
            }
          }
        });

      secondaryPromise
        .then((res) => {
          if (!settled) {
            settled = true;
            primaryController.abort("cancelled_by_winner");
            resolve(res);
          }
        })
        .catch((err) => {
          secondaryError = err;
          if (settled) return;
          if (primaryError) {
            settled = true;
            reject(primaryError);
          }
        });
    });

    return {
      value: winner.value,
      winnerUrl: winner.winnerUrl,
      hedgedDispatched,
      durationMs: Math.max(0, now() - startedAt),
    };
  } finally {
    if (timer) clearTimeout(timer);
    options.parentSignal?.removeEventListener("abort", handleParentAbort);
  }
}
