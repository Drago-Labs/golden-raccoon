/** Pure combination of the three step states into one coverage summary. */
import type { AttestationStep, BurnStep, CoverageState, DestinationStep } from "./schema";

export function summarizeCoverage(burn: BurnStep, attestation: AttestationStep, destination: DestinationStep): { state: CoverageState; note: string } {
  if (burn.state === "unknown" || burn.state === "failed") {
    return { state: "unavailable", note: burn.issues[0] ?? "The source burn could not be read." };
  }
  if (burn.state === "pending") {
    return { state: "partial", note: "The source transaction is not yet confirmed; no further step can be checked." };
  }

  // burn.state === "completed" from here on.
  if (attestation.state === "unknown") {
    return { state: "partial", note: attestation.issues[0] ?? "The source burn was read, but the attestation service could not be queried." };
  }

  if (destination.state === "unknown") {
    return { state: "partial", note: "The source burn and attestation were read, but destination completion could not be checked." };
  }

  if (attestation.state === "completed" && destination.state === "completed") {
    return { state: "complete", note: "The burn, attestation, and destination receipt were all confirmed." };
  }

  return { state: "partial", note: "The source burn was confirmed; the attestation or destination receipt is still pending." };
}
