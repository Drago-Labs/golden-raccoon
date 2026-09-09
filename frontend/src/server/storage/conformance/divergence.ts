import type { IStorageAdapter } from "../adapters/types";
import type { TransactionRecord } from "@/server/types";

/**
 * Adapter wrapper that reverses list ordering to confirm ordering divergence detection.
 */
export function createDivergentOrderingAdapter(base: IStorageAdapter): IStorageAdapter {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "listTransactionRecords") {
        return async (...args: any[]) => {
          const list: TransactionRecord[] = await (target as any).listTransactionRecords(...args);
          return [...list].reverse();
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Adapter wrapper that coerces nulls to empty strings to confirm nullability divergence detection.
 */
export function createDivergentNullabilityAdapter(base: IStorageAdapter): IStorageAdapter {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "getTransactionRecord") {
        return async (...args: any[]) => {
          const res: TransactionRecord | null = await (target as any).getTransactionRecord(...args);
          if (!res) return null;
          return {
            ...res,
            decisionId: res.decisionId ?? "",
            replacementHash: res.replacementHash ?? "",
          };
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Adapter wrapper that throws unnormalized errors instead of StorageUniqueViolationError.
 */
export function createDivergentErrorMappingAdapter(base: IStorageAdapter): IStorageAdapter {
  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "createTransactionRecord") {
        return async (...args: any[]) => {
          try {
            return await (target as any).createTransactionRecord(...args);
          } catch (err) {
            // Throw plain untyped Error instead of StorageUniqueViolationError
            throw new Error("Generic unmapped database error: duplicate key");
          }
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * Adapter wrapper that adds an uncovered public method to confirm method coverage enforcement.
 */
export function createDivergentCoverageAdapter(base: IStorageAdapter): IStorageAdapter & { uncoveredMethod: () => void } {
  const adapter = Object.create(base);
  adapter.uncoveredMethod = function () {
    return "uncovered";
  };
  return adapter;
}
