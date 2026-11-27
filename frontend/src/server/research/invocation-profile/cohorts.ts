import type { AttributedInvocation, CohortSummary } from "./schema";

/**
 * Split callers into new versus returning using prior activity outside the window.
 * `priorCallerDays` maps account -> days observed before windowStart.
 */
export function computeCallerCohorts(
  invocations: AttributedInvocation[],
  priorCallerDays: Record<string, string[]> = {},
): CohortSummary {
  const inWindow = new Set(invocations.map((row) => row.originatingAccount));
  const newCallerAccounts: string[] = [];
  const returningCallerAccounts: string[] = [];

  for (const account of inWindow) {
    const prior = priorCallerDays[account];
    if (prior && prior.length > 0) {
      returningCallerAccounts.push(account);
    } else {
      newCallerAccounts.push(account);
    }
  }

  newCallerAccounts.sort();
  returningCallerAccounts.sort();

  return {
    newCallers: newCallerAccounts.length,
    returningCallers: returningCallerAccounts.length,
    newCallerAccounts,
    returningCallerAccounts,
  };
}
