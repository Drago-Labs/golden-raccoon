import type { AllowancePair } from "./schema";

export type Candidate = AllowancePair & { source: "logs" | "explicit" | "both" };

const normalize = (value: string) => value.toLowerCase();

export function mergeCandidates(logPairs: AllowancePair[], explicitPairs: AllowancePair[]): Candidate[] {
  const values = new Map<string, Candidate>();
  for (const [source, pairs] of [["logs", logPairs], ["explicit", explicitPairs]] as const) {
    for (const pair of pairs) {
      const token = normalize(pair.token);
      const spender = normalize(pair.spender);
      const key = `${token}:${spender}`;
      const prior = values.get(key);
      values.set(key, { token, spender, source: prior && prior.source !== source ? "both" : source });
    }
  }
  return [...values.values()].sort((a, b) => a.spender.localeCompare(b.spender) || a.token.localeCompare(b.token));
}
