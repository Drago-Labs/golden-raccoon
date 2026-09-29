import type {
  IssuerAccountReader,
  MetadataObservation,
  TomlFetchResult,
  TomlFetcher,
} from "@/server/research/metadata-integrity/schema";
import { buildMetadataIdentityKey } from "@/server/research/metadata-integrity/identityKey";
import { buildObservation } from "@/server/research/metadata-integrity/observations";

/** Centre.io USDC issuer on pubnet — a valid Ed25519 public key. */
export const ISSUER_A = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
/** Distinct valid issuer used for conflict fixtures. */
export const ISSUER_B = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const MATCHING_TOML = `
[DOCUMENTATION]
ORG_NAME="Example Org"
ORG_URL="https://example.com"

[[CURRENCIES]]
code="USDC"
issuer="${ISSUER_A}"
name="USD Coin"
desc="A dollar token"
image="https://example.com/usdc.png"
status="live"
`;

export const CONFLICTING_TOML = `
[[CURRENCIES]]
code="USDC"
issuer="${ISSUER_B}"
name="Impostor USDC"
desc="Same symbol, different issuer"
`;

export const EXPIRED_TOML = `
[[CURRENCIES]]
code="USDC"
issuer="${ISSUER_A}"
name="USD Coin"
status="dead"
`;

export const ABSENT_TOML = `
[[CURRENCIES]]
code="EURC"
issuer="${ISSUER_A}"
name="Euro Coin"
`;

export function request(overrides: Record<string, unknown> = {}) {
  return {
    assetCode: "USDC",
    issuer: ISSUER_A,
    network: "pubnet",
    homeDomain: "example.com",
    evaluatedAt: "2026-03-01T12:00:00.000Z",
    priorObservations: [],
    ...overrides,
  };
}

export function createIssuerReader(
  overrides: Partial<{
    homeDomain: string | null;
    sequence: string | null;
    lastModifiedLedger: number | null;
    found: boolean;
    issues: string[];
  }> = {},
): IssuerAccountReader {
  return async () => ({
    homeDomain: "example.com",
    sequence: "12345",
    lastModifiedLedger: 50_000_000,
    found: true,
    issues: [],
    ...overrides,
  });
}

export function createTomlFetcher(result: Partial<TomlFetchResult> & { body?: string | null }): TomlFetcher {
  return async () => ({
    outcome: result.outcome ?? "ok",
    requestedUrl: result.requestedUrl ?? "https://example.com/.well-known/stellar.toml",
    finalUrl: result.finalUrl ?? "https://example.com/.well-known/stellar.toml",
    httpStatus: result.httpStatus ?? 200,
    redirectCount: result.redirectCount ?? 0,
    contentType: result.contentType ?? "text/plain",
    byteLength: result.byteLength ?? (result.body?.length ?? 0),
    body: result.body ?? null,
    issues: result.issues ?? [],
  });
}

export function priorObservation(overrides: Partial<MetadataObservation> = {}): MetadataObservation {
  const network = overrides.network ?? "pubnet";
  const assetCode = overrides.assetCode ?? "USDC";
  const issuer = overrides.issuer ?? ISSUER_A;
  const identityKey = overrides.identityKey ?? buildMetadataIdentityKey({ network, assetCode, issuer });
  const snapshot = overrides.snapshot ?? {
    name: "USD Coin",
    description: "A dollar token",
    orgUrl: "https://example.com",
    image: "https://example.com/usdc.png",
    status: "live",
    code: "USDC",
    issuer: ISSUER_A,
    homeDomain: "example.com",
    tomlUrl: "https://example.com/.well-known/stellar.toml",
  };

  return buildObservation({
    observationId: overrides.observationId ?? "prior-obs-1",
    observedAt: overrides.observedAt ?? "2026-02-01T12:00:00.000Z",
    identityKey,
    network,
    assetCode,
    issuer,
    issuerLedgerRef: overrides.issuerLedgerRef ?? {
      sequence: "10000",
      lastModifiedLedger: 49_000_000,
      accountUrl: `https://horizon.stellar.org/accounts/${issuer}`,
    },
    declarationStatus: overrides.declarationStatus ?? "matched",
    fetchOutcome: overrides.fetchOutcome ?? "ok",
    exactLinks: overrides.exactLinks ?? {
      stellarTomlUrl: snapshot.tomlUrl,
      orgUrl: snapshot.orgUrl,
      imageUrl: snapshot.image,
    },
    snapshot,
    notes: overrides.notes ?? ["Historical fixture observation."],
  });
}
