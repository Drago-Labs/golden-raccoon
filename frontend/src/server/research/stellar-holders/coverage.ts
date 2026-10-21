/**
 * How much of the issued supply this read actually observed.
 *
 * The fraction is observed trustlines + pools + claimables, over the asset
 * record's issued amount. Contract balances stay in the issued total and are
 * called out, because this feature does not walk them as holders. A truncated
 * page is partial even when the numbers happen to match.
 */
import { exactRatio, formatBaseUnits, parseBaseUnits } from "./concentration";
import type { AnalysisState, CoverageReport } from "./schema";

export function buildHolderCoverage(input: {
  coveredBaseUnits: bigint;
  issuedAmount: string;
  truncated: boolean;
  duplicateCursor: boolean;
  holdersSeen: number;
  pagesRead: number;
  ledger: number | null;
  tomlRead: boolean;
  contractsBaseUnits: bigint;
}): CoverageReport {
  const issued = parseBaseUnits(input.issuedAmount);
  const issuedText = formatBaseUnits(issued);
  const fraction = exactRatio(input.coveredBaseUnits, issued);
  const state = coverageState(input.coveredBaseUnits, issued, input.truncated);
  const ledgerText = input.ledger === null ? "an unknown ledger" : `ledger ${input.ledger}`;
  let note = noteFor(state, input.coveredBaseUnits, issued, fraction, ledgerText, input.truncated);

  if (input.contractsBaseUnits > 0n && state !== "empty") {
    note += ` Contract balances of ${formatBaseUnits(input.contractsBaseUnits)} are part of issued supply and are not walked as holders.`;
  }

  if (!input.tomlRead && state !== "empty") {
    note += " stellar.toml distribution accounts were not read, so issuer-adjacent marking may be incomplete.";
  }

  return {
    state,
    coveredBaseUnits: input.coveredBaseUnits.toString(),
    covered: formatBaseUnits(input.coveredBaseUnits),
    issuedBaseUnits: issued.toString(),
    issued: issuedText,
    fraction,
    holdersSeen: input.holdersSeen,
    pagesRead: input.pagesRead,
    truncated: input.truncated,
    duplicateCursor: input.duplicateCursor,
    note,
  };
}

export function unavailableCoverage(message: string): CoverageReport {
  return {
    state: "unavailable",
    coveredBaseUnits: "0",
    covered: "0.0000000",
    issuedBaseUnits: "0",
    issued: "0.0000000",
    fraction: { numerator: "0", denominator: "0" },
    holdersSeen: 0,
    pagesRead: 0,
    truncated: false,
    duplicateCursor: false,
    note: message,
  };
}

function coverageState(covered: bigint, issued: bigint, truncated: boolean): AnalysisState {
  if (covered === 0n && issued === 0n) return "empty";
  if (truncated || covered !== issued) return "partial";

  return "complete";
}

function noteFor(
  state: AnalysisState,
  covered: bigint,
  issued: bigint,
  fraction: { numerator: string; denominator: string },
  ledgerText: string,
  truncated: boolean,
): string {
  if (state === "empty") {
    return `This asset has no issued supply and no observed holders at ${ledgerText}.`;
  }

  if (state === "complete") {
    return `Trustlines, liquidity-pool reserves, and claimable balances observed at ${ledgerText} sum to the issued supply.`;
  }

  const reason = truncated
    ? "Paging stopped before every record was read."
    : "Observed supply does not equal the issued amount.";

  return `${reason} Covered ${formatBaseUnits(covered)} of ${formatBaseUnits(issued)} issued at ${ledgerText} (${fraction.numerator}/${fraction.denominator}).`;
}

