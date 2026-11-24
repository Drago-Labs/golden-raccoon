import type { EvaluationState } from "./errors";

/** Describe what the evaluation covered. Gaps are never filled with guesses. */
export function coverageNotice(state: EvaluationState, reasons: string[]): string {
  if (state === "unavailable") {
    return "Ledger state was unavailable. Preconditions were decoded from the envelope only; no validity against the live network is claimed.";
  }
  if (state === "partial") {
    const detail = reasons.length > 0 ? ` ${reasons.join(" ")}` : "";
    return `Evaluation is partial.${detail} Missing ledger evidence was not replaced with a guessed close time or sequence.`;
  }
  return "Envelope preconditions were decoded and compared to the recorded ledger number, close time, and source account sequence. Nothing was signed or submitted.";
}
