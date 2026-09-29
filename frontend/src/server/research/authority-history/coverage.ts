import type { AuthorityCoverage } from "./schema";

export function buildCoverage(
  input: Omit<AuthorityCoverage, "state" | "message" | "reconstructionValid"> & {
    reconstructionValid?: boolean;
  },
): AuthorityCoverage {
  const unavailable = input.snapshotBlock === null;

  const empty =
    input.eventCount === 0 &&
    input.logCoverageComplete &&
    !input.reorgDetected &&
    input.missingBlockHashes === 0;

  const partial =
    !input.logCoverageComplete ||
    input.reorgDetected ||
    input.missingBlockHashes > 0 ||
    input.truncated ||
    input.providerLimitations.length > 0;

  let state: AuthorityCoverage["state"];
  if (unavailable) state = "unavailable";
  else if (empty) state = "empty";
  else if (partial) state = "partial";
  else state = "complete";

  const reconstructionValid =
    input.reconstructionValid ??
    (state === "complete" || (state === "empty" && input.logCoverageComplete));

  const message =
    state === "complete"
      ? "Every block in the requested range was readable and hashes still match. Reconstructed holders apply only inside this window — missing history outside it never proves that no authority exists."
      : state === "empty"
        ? "No standard Ownable, AccessControl, or ERC-1967 admin events were observed in this range. That does not prove the contract has no authority; custom access models may still control it."
        : state === "partial"
          ? "Coverage is incomplete. Reconstructed role state is withheld or marked invalid where gaps, reorgs, or missing block hashes affect the range. Do not treat this as an all-clear."
          : "The provider could not produce a reliable authority history for this range. Retry later; absence of a report never proves absence of authority.";

  return {
    ...input,
    reconstructionValid:
      reconstructionValid &&
      !input.reorgDetected &&
      input.missingBlockHashes === 0 &&
      input.logCoverageComplete,
    state,
    message,
  };
}
