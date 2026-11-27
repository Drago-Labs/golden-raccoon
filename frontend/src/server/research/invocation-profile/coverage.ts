import type { InvocationProfileState } from "./errors";
import type { CoverageGap } from "./schema";

export function coverageNotice(state: InvocationProfileState, gaps: CoverageGap[], sampled: number, truncated: boolean): string {
  if (state === "unavailable") {
    return "Invocation data is currently unavailable. Sampling and attribution limits apply when the provider recovers.";
  }

  const parts: string[] = [];
  if (state === "partial") {
    parts.push("Partial coverage for the selected window.");
  } else {
    parts.push("Complete coverage for the selected window.");
  }

  parts.push(`Sampled ${sampled} invocation(s).`);

  if (truncated) {
    parts.push("Results were truncated at the feature invocation limit; later ledgers may be missing.");
  }

  for (const gap of gaps) {
    parts.push(`Gap ${gap.fromLedger}–${gap.toLedger} (${gap.reason}).`);
  }

  parts.push("Attribution separates direct account callers from contract intermediaries; nested calls credit both.");
  return parts.join(" ");
}
