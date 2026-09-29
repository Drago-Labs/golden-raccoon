/**
 * Match asset code + issuer against SEP-1 currency entries.
 *
 * Matching requires both code and issuer when the TOML declares an issuer.
 * Symbol-only agreement is never enough for `matched`.
 */
import type { Sep1TomlData } from "@/server/stellar/assetIdentity";
import type { DeclarationStatus, TomlFetchOutcome } from "./schema";

export type CurrencyMatch = {
  status: DeclarationStatus;
  matchingCurrency: NonNullable<Sep1TomlData["currencies"]>[number] | undefined;
  conflictingCurrency: NonNullable<Sep1TomlData["currencies"]>[number] | undefined;
  notes: string[];
};

const RETIRED_STATUSES = new Set(["dead", "removed", "deprecated", "retired"]);

export function matchCurrencyDeclaration(
  currencies: Sep1TomlData["currencies"] | undefined,
  assetRef: { code: string; issuer: string },
  fetchOutcome: TomlFetchOutcome,
): CurrencyMatch {
  if (fetchOutcome !== "ok") {
    return {
      status: "unreachable",
      matchingCurrency: undefined,
      conflictingCurrency: undefined,
      notes: ["Declaration could not be compared because the TOML fetch did not succeed."],
    };
  }

  const list = currencies ?? [];
  const code = assetRef.code.toUpperCase();
  const issuer = assetRef.issuer.toUpperCase();

  const exact = list.find(
    (currency) =>
      currency.code?.toUpperCase() === code && currency.issuer?.toUpperCase() === issuer,
  );

  if (exact) {
    const statusValue = exact.status?.trim().toLowerCase() ?? "";
    if (statusValue && RETIRED_STATUSES.has(statusValue)) {
      return {
        status: "expired",
        matchingCurrency: exact,
        conflictingCurrency: undefined,
        notes: [`Currency entry is present but marked retired (${exact.status}).`],
      };
    }

    return {
      status: "matched",
      matchingCurrency: exact,
      conflictingCurrency: undefined,
      notes: ["Asset code and issuer both appear together in a CURRENCIES entry."],
    };
  }

  const sameCodeDifferentIssuer = list.find(
    (currency) =>
      currency.code?.toUpperCase() === code &&
      currency.issuer &&
      currency.issuer.toUpperCase() !== issuer,
  );

  if (sameCodeDifferentIssuer) {
    return {
      status: "conflicting",
      matchingCurrency: undefined,
      conflictingCurrency: sameCodeDifferentIssuer,
      notes: [
        `TOML declares ${code} with issuer ${sameCodeDifferentIssuer.issuer}, which differs from the requested issuer.`,
      ],
    };
  }

  const sameIssuerDifferentCode = list.find(
    (currency) =>
      currency.issuer?.toUpperCase() === issuer &&
      currency.code &&
      currency.code.toUpperCase() !== code,
  );

  if (sameIssuerDifferentCode) {
    return {
      status: "absent",
      matchingCurrency: undefined,
      conflictingCurrency: undefined,
      notes: [
        `Issuer appears in TOML under code ${sameIssuerDifferentCode.code}, but not under ${code}.`,
      ],
    };
  }

  return {
    status: "absent",
    matchingCurrency: undefined,
    conflictingCurrency: undefined,
    notes: ["No CURRENCIES entry lists this asset code together with this issuer."],
  };
}
