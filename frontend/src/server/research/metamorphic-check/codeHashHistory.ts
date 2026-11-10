import type { CodeHashComparison, CodeHashSample } from "./schema";

export function compareCodeHashes(samples: CodeHashSample[]): CodeHashComparison {
  const nonNull = samples.map((s) => s.codeHash).filter((h): h is string => Boolean(h));
  const distinct = new Set(nonNull.map((h) => h.toLowerCase()));
  return {
    samples,
    historicalCodeChangeDetected: distinct.size > 1,
  };
}
