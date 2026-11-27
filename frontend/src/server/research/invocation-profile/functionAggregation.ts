import type { AttributedInvocation, FunctionAggregate } from "./schema";

/** Aggregate success/failure and caller mix per function name. */
export function aggregateByFunction(invocations: AttributedInvocation[]): FunctionAggregate[] {
  const byName = new Map<
    string,
    {
      successCount: number;
      failureCount: number;
      callers: Set<string>;
      directCallers: Set<string>;
      viaContractCallers: Set<string>;
    }
  >();

  for (const row of invocations) {
    let bucket = byName.get(row.functionName);
    if (!bucket) {
      bucket = {
        successCount: 0,
        failureCount: 0,
        callers: new Set(),
        directCallers: new Set(),
        viaContractCallers: new Set(),
      };
      byName.set(row.functionName, bucket);
    }

    if (row.success) bucket.successCount += 1;
    else bucket.failureCount += 1;

    bucket.callers.add(row.originatingAccount);
    if (row.callerKind === "direct_account") {
      bucket.directCallers.add(row.originatingAccount);
    } else {
      bucket.viaContractCallers.add(row.originatingAccount);
    }
  }

  return [...byName.entries()]
    .map(([functionName, bucket]) => ({
      functionName,
      successCount: bucket.successCount,
      failureCount: bucket.failureCount,
      uniqueCallers: bucket.callers.size,
      directCallers: bucket.directCallers.size,
      viaContractCallers: bucket.viaContractCallers.size,
    }))
    .sort((a, b) => b.successCount + b.failureCount - (a.successCount + a.failureCount) || a.functionName.localeCompare(b.functionName));
}
