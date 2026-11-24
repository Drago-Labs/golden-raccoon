import type { AttributedInvocation, ConcentrationMetrics } from "./schema";

/**
 * Caller concentration from invocation counts: top-caller share and Herfindahl index.
 * Shares use floating ratios suitable for display; they are not used for scoring.
 */
export function computeCallerConcentration(invocations: AttributedInvocation[]): ConcentrationMetrics {
  const counts = new Map<string, number>();
  for (const row of invocations) {
    counts.set(row.originatingAccount, (counts.get(row.originatingAccount) ?? 0) + 1);
  }

  const callerCount = counts.size;
  const totalInvocations = invocations.length;
  if (callerCount === 0 || totalInvocations === 0) {
    return {
      callerCount: 0,
      totalInvocations: 0,
      topCallerShare: 0,
      topCallerAccount: null,
      herfindahl: 0,
    };
  }

  let topCallerAccount: string | null = null;
  let topCount = 0;
  let herfindahl = 0;
  for (const [account, count] of counts) {
    if (count > topCount) {
      topCount = count;
      topCallerAccount = account;
    }
    const share = count / totalInvocations;
    herfindahl += share * share;
  }

  return {
    callerCount,
    totalInvocations,
    topCallerShare: topCount / totalInvocations,
    topCallerAccount,
    herfindahl,
  };
}

/** Aggregate per originating account for the caller table. */
export function aggregateByCaller(invocations: AttributedInvocation[]) {
  const byAccount = new Map<
    string,
    {
      successCount: number;
      failureCount: number;
      functions: Set<string>;
      directCount: number;
      viaContractCount: number;
      intermediaries: Set<string>;
    }
  >();

  for (const row of invocations) {
    let bucket = byAccount.get(row.originatingAccount);
    if (!bucket) {
      bucket = {
        successCount: 0,
        failureCount: 0,
        functions: new Set(),
        directCount: 0,
        viaContractCount: 0,
        intermediaries: new Set(),
      };
      byAccount.set(row.originatingAccount, bucket);
    }
    if (row.success) bucket.successCount += 1;
    else bucket.failureCount += 1;
    bucket.functions.add(row.functionName);
    if (row.callerKind === "direct_account") bucket.directCount += 1;
    else {
      bucket.viaContractCount += 1;
      if (row.intermediary) bucket.intermediaries.add(row.intermediary);
    }
  }

  return [...byAccount.entries()]
    .map(([account, bucket]) => ({
      account,
      successCount: bucket.successCount,
      failureCount: bucket.failureCount,
      functionNames: [...bucket.functions].sort(),
      directCount: bucket.directCount,
      viaContractCount: bucket.viaContractCount,
      intermediaries: [...bucket.intermediaries].sort(),
    }))
    .sort(
      (a, b) =>
        b.successCount + b.failureCount - (a.successCount + a.failureCount) || a.account.localeCompare(b.account),
    );
}
