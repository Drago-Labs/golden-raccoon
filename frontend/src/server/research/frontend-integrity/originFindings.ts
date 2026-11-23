import type { Finding, ScriptRecord } from "./schema";

/** New third-party origins and scripts shipped without an integrity attribute. */
export function findOriginIssues(scripts: ScriptRecord[], pageOrigin: string, previousOrigins: Set<string>): Finding[] {
  const findings: Finding[] = [];
  for (const script of scripts) {
    if (script.integrity === null) {
      findings.push({
        kind: "missing_integrity",
        detail: script.src ?? `inline ${script.sha256.slice(0, 12)}`,
      });
    }
    if (script.origin !== pageOrigin && !previousOrigins.has(script.origin)) {
      findings.push({ kind: "new_third_party", detail: script.origin });
    }
  }
  return findings;
}
