/**
 * Horizon issuer-account reader for home_domain and ledger references.
 */
import { horizonAccountUrl, horizonBaseUrl } from "./identityKey";
import type { IssuerAccountReader, StellarNetworkShort } from "./schema";

export async function readIssuerAccount(input: {
  issuer: string;
  network: StellarNetworkShort;
  fetchImpl?: typeof fetch;
}): Promise<{
  homeDomain: string | null;
  sequence: string | null;
  lastModifiedLedger: number | null;
  found: boolean;
  issues: string[];
}> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = horizonAccountUrl(input.network, input.issuer);

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (response.status === 404) {
      return {
        homeDomain: null,
        sequence: null,
        lastModifiedLedger: null,
        found: false,
        issues: ["Issuer account was not found on this network."],
      };
    }

    if (!response.ok) {
      return {
        homeDomain: null,
        sequence: null,
        lastModifiedLedger: null,
        found: false,
        issues: [`Horizon returned HTTP ${response.status} for the issuer account.`],
      };
    }

    const body = (await response.json()) as {
      home_domain?: string;
      sequence?: string;
      last_modified_ledger?: number;
    };

    return {
      homeDomain: body.home_domain?.trim().toLowerCase() || null,
      sequence: body.sequence ?? null,
      lastModifiedLedger: typeof body.last_modified_ledger === "number" ? body.last_modified_ledger : null,
      found: true,
      issues: [],
    };
  } catch (error) {
    return {
      homeDomain: null,
      sequence: null,
      lastModifiedLedger: null,
      found: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function createProductionIssuerReader(): IssuerAccountReader {
  return ({ issuer, network }) => readIssuerAccount({ issuer, network });
}

export { horizonBaseUrl, horizonAccountUrl };
