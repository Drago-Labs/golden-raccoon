import type { DiagnosisState } from "./errors";

export function coverageNotice(state: DiagnosisState, reasons: string[]): string {
  if (state === "unavailable") {
    return "The transaction record was unavailable. No cause is inferred.";
  }
  if (state === "partial") {
    const detail = reasons.length > 0 ? ` ${reasons.join(" ")}` : "";
    return `Diagnosis is partial.${detail} Missing evidence was not replaced with a guessed cause.`;
  }
  return "Result codes and recorded ledger state were both available. The transaction was not retried or rebuilt.";
}
