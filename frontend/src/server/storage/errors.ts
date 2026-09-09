/**
 * Unified storage error hierarchy for storage adapters.
 */

export class StorageError extends Error {
  readonly operation: string;
  readonly code: string;
  readonly cause?: unknown;

  /**
   * Constructs a storage error.
   *
   * @param operation Name of the storage operation that failed.
   * @param message Descriptive error message.
   * @param code Classification error code.
   * @param cause Underlying root cause error.
   */
  constructor(operation: string, message: string, code: string = "storage_error", cause?: unknown) {
    super(`Storage error [${operation}]: ${message}`);
    this.name = "StorageError";
    this.operation = operation;
    this.code = code;
    this.cause = cause;
  }
}

export class StorageUniqueViolationError extends StorageError {
  readonly conflictKey?: string;
  readonly targetTable?: string;

  /**
   * Constructs a uniqueness constraint violation error.
   *
   * @param operation Name of the storage operation that failed.
   * @param message Descriptive error message.
   * @param conflictKey Optional key or value that violated uniqueness.
   * @param targetTable Optional table where the violation occurred.
   * @param cause Underlying root cause error.
   */
  constructor(
    operation: string,
    message: string,
    conflictKey?: string,
    targetTable?: string,
    cause?: unknown,
  ) {
    super(operation, message, "unique_violation", cause);
    this.name = "StorageUniqueViolationError";
    this.conflictKey = conflictKey;
    this.targetTable = targetTable;
  }
}

export class StorageNotFoundError extends StorageError {
  readonly entityId?: string;

  /**
   * Constructs an entity not found error.
   *
   * @param operation Name of the storage operation that failed.
   * @param message Descriptive error message.
   * @param entityId Optional identifier of the missing entity.
   * @param cause Underlying root cause error.
   */
  constructor(operation: string, message: string, entityId?: string, cause?: unknown) {
    super(operation, message, "not_found", cause);
    this.name = "StorageNotFoundError";
    this.entityId = entityId;
  }
}

export class StorageValidationError extends StorageError {
  readonly fields?: Record<string, string>;

  /**
   * Constructs an entity validation error.
   *
   * @param operation Name of the storage operation that failed.
   * @param message Descriptive error message.
   * @param fields Optional mapping of invalid field names to error reasons.
   * @param cause Underlying root cause error.
   */
  constructor(
    operation: string,
    message: string,
    fields?: Record<string, string>,
    cause?: unknown,
  ) {
    super(operation, message, "validation_error", cause);
    this.name = "StorageValidationError";
    this.fields = fields;
  }
}

export class StorageConnectionError extends StorageError {
  /**
   * Constructs a storage connection error.
   *
   * @param operation Name of the storage operation that failed.
   * @param message Descriptive error message.
   * @param cause Underlying root cause error.
   */
  constructor(operation: string, message: string, cause?: unknown) {
    super(operation, message, "connection_error", cause);
    this.name = "StorageConnectionError";
  }
}

/**
 * Type guard verifying if an unknown error represents a unique constraint violation.
 *
 * @param error Error to inspect.
 * @returns True when the error is a StorageUniqueViolationError.
 */
export function isStorageUniqueViolation(error: unknown): error is StorageUniqueViolationError {
  if (error instanceof StorageUniqueViolationError) {
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "unique_violation"
  ) {
    return true;
  }
  return false;
}

/**
 * Normalizes an arbitrary error into a typed StorageError subclass.
 * Maps Postgres 23505 and PostgREST unique violation responses to StorageUniqueViolationError.
 *
 * @param operation Name of the failing storage operation.
 * @param error Caught error from underlying database or client.
 * @param targetTable Optional table identifier for context.
 * @returns Normalized StorageError instance.
 */
export function normalizeStorageError(
  operation: string,
  error: unknown,
  targetTable?: string,
): StorageError {
  if (error instanceof StorageError) {
    return error;
  }

  const errorObj = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : null;
  const rawCode = errorObj ? String(errorObj.code ?? "") : "";
  const rawMessage = error instanceof Error ? error.message : String(error ?? "Unknown error");

  if (
    rawCode === "23505" ||
    rawMessage.includes("duplicate key") ||
    rawMessage.includes("violates unique constraint") ||
    rawMessage.includes("unique_violation")
  ) {
    return new StorageUniqueViolationError(operation, rawMessage, undefined, targetTable, error);
  }

  if (rawCode === "23503" || rawMessage.includes("violates foreign key constraint")) {
    return new StorageValidationError(operation, rawMessage, undefined, error);
  }

  return new StorageError(operation, rawMessage, rawCode || "storage_error", error);
}
