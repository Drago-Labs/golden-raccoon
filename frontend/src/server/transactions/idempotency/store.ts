import { ApiError, type ApiErrorCode } from "@/server/api/errors";

export type IdempotencyRecordStatus = "in_flight" | "resolved" | "failed";

export interface IdempotencyRecord<T = unknown> {
  key: string;
  scope: string;
  fingerprint: string;
  status: IdempotencyRecordStatus;
  createdAt: string;
  expiresAt: string;
  outcome?: T;
  error?: {
    code: ApiErrorCode;
    message: string;
    status: number;
    details?: unknown;
  };
  promise?: Promise<T>;
  resolveDeferred?: (value: T) => void;
  rejectDeferred?: (reason?: unknown) => void;
}

export interface AcquireResult<T = unknown> {
  isReplay: boolean;
  outcome?: T;
}

export const DEFAULT_RETENTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export class IdempotencyPayloadMismatchError extends ApiError {
  readonly statusCode: number = 409;
  readonly storedFingerprint: string;
  readonly incomingFingerprint: string;

  constructor(key: string, storedFingerprint: string, incomingFingerprint: string) {
    super(
      "idempotency_payload_mismatch",
      `Idempotency key '${key}' was previously used with a different request payload fingerprint. Concurrent or repeated execution with altered parameters is strictly rejected.`,
      409,
      {
        retryable: false,
        recoveryAction: "stop",
        details: {
          key,
          storedFingerprint,
          incomingFingerprint,
        },
      },
    );
    this.name = "IdempotencyPayloadMismatchError";
    this.storedFingerprint = storedFingerprint;
    this.incomingFingerprint = incomingFingerprint;
  }
}

export interface IdempotencyStoreOptions {
  retentionWindowMs?: number;
  now?: () => number;
}

export class IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();
  private defaultTtlMs: number;
  private now: () => number;

  constructor(optionsOrTtl: number | IdempotencyStoreOptions = DEFAULT_RETENTION_WINDOW_MS) {
    if (typeof optionsOrTtl === "number") {
      this.defaultTtlMs = optionsOrTtl;
      this.now = () => Date.now();
    } else {
      this.defaultTtlMs = optionsOrTtl.retentionWindowMs ?? DEFAULT_RETENTION_WINDOW_MS;
      this.now = optionsOrTtl.now ?? (() => Date.now());
    }
  }

  /**
   * Retrieves an idempotency record if present and unexpired.
   */
  get(key: string): IdempotencyRecord | undefined {
    const record = this.records.get(key);
    if (!record) return undefined;
    const now = this.now();
    const expiresAtTs = new Date(record.expiresAt).getTime();
    if (!Number.isNaN(expiresAtTs) && now >= expiresAtTs) {
      this.records.delete(key);
      return undefined;
    }
    return record;
  }

  /**
   * Acquires the execution gate for a given idempotency key.
   * If an identical request is already resolved, returns the stored outcome with { isReplay: true }.
   * If an identical request is currently in-flight, the caller awaits the in-flight promise and never broadcasts.
   * If the payload fingerprint does not match the stored key's fingerprint, throws a 409 conflict error.
   */
  async acquireOrWait<T = unknown>(
    key: string,
    scope: string,
    fingerprint: string,
    ttlMs: number = this.defaultTtlMs,
  ): Promise<AcquireResult<T>> {
    const existing = this.get(key);
    const now = this.now();

    if (existing) {
      // Check for expiration
      const expiresAtTs = new Date(existing.expiresAt).getTime();
      if (!Number.isNaN(expiresAtTs) && now >= expiresAtTs) {
        this.records.delete(key);
      } else {
        // Enforce fingerprint match
        if (existing.fingerprint !== fingerprint) {
          throw new IdempotencyPayloadMismatchError(key, existing.fingerprint, fingerprint);
        }

        // Check resolved status
        if (existing.status === "resolved") {
          return {
            isReplay: true,
            outcome: existing.outcome as T,
          };
        }

        // Check failed status
        if (existing.status === "failed") {
          const err = existing.error;
          throw new ApiError(
            err?.code ?? "internal_error",
            err?.message ?? "Previous execution with this idempotency key failed.",
            err?.status ?? 500,
            { retryable: false, recoveryAction: "stop", details: err?.details },
          );
        }

        // If in-flight, wait for the winner's outcome
        if (existing.status === "in_flight" && existing.promise) {
          const outcome = await existing.promise;
          return {
            isReplay: true,
            outcome: outcome as T,
          };
        }
      }
    }

    // Winner of the key: create an in-flight record with a deferred Promise
    let resolveDeferred!: (value: unknown) => void;
    let rejectDeferred!: (reason?: unknown) => void;

    const promise = new Promise<unknown>((res, rej) => {
      resolveDeferred = res;
      rejectDeferred = rej;
    });

    // Prevent uncaught rejection warning on the internal promise
    promise.catch(() => {});

    const record: IdempotencyRecord = {
      key,
      scope,
      fingerprint,
      status: "in_flight",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      promise,
      resolveDeferred,
      rejectDeferred,
    };

    this.records.set(key, record);

    return {
      isReplay: false,
    };
  }

  /**
   * Resolves the in-flight key with a successful outcome.
   * Stores the outcome for subsequent replays and unlocks any waiting concurrent callers.
   */
  resolveKey<T = unknown>(
    key: string,
    outcome: T,
    fingerprint: string = "",
    scope: string = "default",
  ): void {
    let record = this.records.get(key);
    const now = this.now();
    if (!record) {
      record = {
        key,
        scope,
        fingerprint,
        status: "resolved",
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + this.defaultTtlMs).toISOString(),
        outcome,
      };
      this.records.set(key, record);
      return;
    }

    record.status = "resolved";
    record.outcome = outcome;

    if (record.resolveDeferred) {
      record.resolveDeferred(outcome);
    }
  }

  /**
   * Rejects the in-flight key with an error.
   * Unlocks waiting concurrent callers and records terminal failure state.
   */
  rejectKey(key: string, error: unknown): void {
    const record = this.records.get(key);
    if (!record) return;

    record.status = "failed";

    if (error instanceof ApiError) {
      record.error = {
        code: error.code,
        message: error.message,
        status: error.status,
        details: error.details,
      };
    } else if (error instanceof Error) {
      record.error = {
        code: "submission_failure",
        message: error.message,
        status: 500,
      };
    } else {
      record.error = {
        code: "submission_failure",
        message: String(error),
        status: 500,
      };
    }

    if (record.rejectDeferred) {
      record.rejectDeferred(error);
    }
  }

  /**
   * Retrieves an idempotency record by key.
   */
  getRecord(key: string): IdempotencyRecord | undefined {
    const record = this.records.get(key);
    if (!record) return undefined;

    const now = Date.now();
    const expiresAtTs = new Date(record.expiresAt).getTime();
    if (!Number.isNaN(expiresAtTs) && now >= expiresAtTs) {
      this.records.delete(key);
      return undefined;
    }

    return record;
  }

  /**
   * Garbage collects all records that have exceeded their retention window.
   */
  pruneExpired(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, record] of this.records.entries()) {
      const expiresAtTs = new Date(record.expiresAt).getTime();
      if (!Number.isNaN(expiresAtTs) && now >= expiresAtTs) {
        this.records.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Clears all records (used for test isolation).
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Returns current count of stored keys.
   */
  get size(): number {
    return this.records.size;
  }
}

/** Global singleton store for the server runtime */
export const globalIdempotencyStore = new IdempotencyStore();
