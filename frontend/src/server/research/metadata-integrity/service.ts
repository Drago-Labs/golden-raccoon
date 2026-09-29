/**
 * Public entry point for the metadata-integrity inspector.
 *
 * Reads issuer home-domain evidence and SEP-1 TOML declarations, builds a
 * comparable observation, and diffs it against caller-supplied history. It
 * never edits metadata, never scores risk, and never decides legitimacy.
 */
import { createHash } from "node:crypto";
import { parseSep1Toml } from "@/server/stellar/assetIdentity";
import {
  buildMetadataIdentityKey,
  horizonAccountUrl,
  normalizeAssetCode,
  normalizeIssuer,
  normalizeNetworkShort,
} from "./identityKey";
import { matchCurrencyDeclaration } from "./matching";
import {
  buildDiffs,
  buildObservation,
  filterPriorForIdentity,
  sortTimeline,
} from "./observations";
import {
  METADATA_SCHEMA_VERSION,
  MetadataIntegrityError,
  metadataIntegrityRequestSchema,
  type IssuerAccountEvidence,
  type IssuerAccountReader,
  type MetadataIntegrityReport,
  type MetadataObservation,
  type MetadataSnapshot,
  type TomlFetchEvidence,
  type TomlFetcher,
} from "./schema";

function truncate(value: string | undefined | null, max = 4_096): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function observationIdFor(identityKey: string, observedAt: string, contentHash: string): string {
  return createHash("sha256").update(`${identityKey}|${observedAt}|${contentHash}`).digest("hex").slice(0, 24);
}

export async function inspectMetadataIntegrity(
  input: unknown,
  deps: {
    readIssuer: IssuerAccountReader;
    fetchToml: TomlFetcher;
  },
): Promise<MetadataIntegrityReport> {
  const parsed = metadataIntegrityRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new MetadataIntegrityError(
      "invalid_request",
      "The metadata integrity request could not be read.",
      parsed.error.flatten(),
    );
  }

  const network = normalizeNetworkShort(parsed.data.network);
  if (!network) {
    throw new MetadataIntegrityError("invalid_network", "The Stellar network could not be recognized.");
  }

  const assetCode = normalizeAssetCode(parsed.data.assetCode);
  if (!assetCode) {
    throw new MetadataIntegrityError("invalid_asset_code", "The asset code is not a valid classic asset code.");
  }

  const issuer = normalizeIssuer(parsed.data.issuer);
  if (!issuer) {
    throw new MetadataIntegrityError("invalid_issuer", "The issuer is not a valid Stellar account.");
  }

  const evaluatedAt = parsed.data.evaluatedAt
    ? new Date(Date.parse(parsed.data.evaluatedAt)).toISOString()
    : new Date().toISOString();

  const identityKey = buildMetadataIdentityKey({ network, assetCode, issuer });
  const accountUrl = horizonAccountUrl(network, issuer);

  const issuerRead = await deps.readIssuer({ issuer, network });
  const homeDomain = (parsed.data.homeDomain?.trim().toLowerCase() || issuerRead.homeDomain || null) ?? null;

  const issuerAccount: IssuerAccountEvidence = {
    accountId: issuer,
    homeDomain,
    sequence: issuerRead.sequence,
    lastModifiedLedger: issuerRead.lastModifiedLedger,
    horizonAccountUrl: accountUrl,
    found: issuerRead.found,
    issues: issuerRead.issues,
  };

  let tomlFetch: TomlFetchEvidence;
  let snapshot: MetadataSnapshot = {
    name: null,
    description: null,
    orgUrl: null,
    image: null,
    status: null,
    code: assetCode,
    issuer,
    homeDomain: null,
    tomlUrl: null,
  };
  let notes: string[] = [
    "A stellar.toml declaration is evidence of a published claim, not proof of domain ownership.",
  ];
  let declarationStatus: MetadataObservation["declarationStatus"] = "unreachable";
  let fetchOutcome: TomlFetchEvidence["outcome"] = "missing_home_domain";

  if (!homeDomain) {
    tomlFetch = {
      requestedUrl: null,
      finalUrl: null,
      outcome: "missing_home_domain",
      httpStatus: null,
      redirectCount: 0,
      contentType: null,
      byteLength: null,
      tlsRequiredHonoured: true,
      issues: ["No home domain was present on the issuer account and none was supplied."],
    };
    snapshot = {
      name: null,
      description: null,
      orgUrl: null,
      image: null,
      status: null,
      code: assetCode,
      issuer,
      homeDomain: null,
      tomlUrl: null,
    };
    notes.push("Without a home domain the inspector cannot fetch SEP-1 metadata.");
    declarationStatus = "unreachable";
    fetchOutcome = "missing_home_domain";
  } else {
    const fetched = await deps.fetchToml({ homeDomain });
    fetchOutcome = fetched.outcome;
    tomlFetch = {
      requestedUrl: fetched.requestedUrl,
      finalUrl: fetched.finalUrl,
      outcome: fetched.outcome,
      httpStatus: fetched.httpStatus,
      redirectCount: fetched.redirectCount,
      contentType: fetched.contentType,
      byteLength: fetched.byteLength,
      tlsRequiredHonoured: (fetched.requestedUrl ?? "").startsWith("https://"),
      issues: fetched.issues,
    };

    if (fetched.outcome !== "ok" || !fetched.body) {
      snapshot = {
        name: null,
        description: null,
        orgUrl: null,
        image: null,
        status: null,
        code: assetCode,
        issuer,
        homeDomain,
        tomlUrl: fetched.finalUrl ?? fetched.requestedUrl,
      };
      notes.push(...fetched.issues);
      declarationStatus = "unreachable";
    } else {
      let parsedToml;
      try {
        parsedToml = parseSep1Toml(fetched.body);
      } catch (error) {
        tomlFetch = {
          ...tomlFetch,
          outcome: "malformed",
          issues: [...tomlFetch.issues, error instanceof Error ? error.message : String(error)],
        };
        snapshot = {
          name: null,
          description: null,
          orgUrl: null,
          image: null,
          status: null,
          code: assetCode,
          issuer,
          homeDomain,
          tomlUrl: fetched.finalUrl ?? fetched.requestedUrl,
        };
        notes.push("The TOML body could not be parsed.");
        declarationStatus = "unreachable";
        fetchOutcome = "malformed";
        parsedToml = undefined;
      }

      if (parsedToml) {
        const match = matchCurrencyDeclaration(parsedToml.currencies, { code: assetCode, issuer }, "ok");
        declarationStatus = match.status;
        notes.push(...match.notes);

        const currency = match.matchingCurrency ?? match.conflictingCurrency;
        snapshot = {
          name: truncate(currency?.name ?? parsedToml.documentation?.orgName),
          description: truncate(currency?.desc),
          orgUrl: truncate(parsedToml.documentation?.orgUrl),
          image: truncate(currency?.image),
          status: truncate(currency?.status),
          code: truncate(currency?.code ?? assetCode),
          issuer: truncate(currency?.issuer ?? null),
          homeDomain,
          tomlUrl: fetched.finalUrl ?? fetched.requestedUrl,
        };
      }
    }
  }

  const exactLinks = {
    stellarTomlUrl: snapshot.tomlUrl,
    orgUrl: snapshot.orgUrl,
    imageUrl: snapshot.image,
  };

  const provisionalHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const currentObservation = buildObservation({
    observationId: observationIdFor(identityKey, evaluatedAt, provisionalHash),
    observedAt: evaluatedAt,
    identityKey,
    network,
    assetCode,
    issuer,
    issuerLedgerRef: {
      sequence: issuerAccount.sequence,
      lastModifiedLedger: issuerAccount.lastModifiedLedger,
      accountUrl: issuerAccount.horizonAccountUrl,
    },
    declarationStatus,
    fetchOutcome,
    exactLinks,
    snapshot,
    notes,
  });

  const priors = filterPriorForIdentity(
    (parsed.data.priorObservations ?? []) as MetadataObservation[],
    identityKey,
  );
  const timeline = sortTimeline([...priors, currentObservation]);
  const diffs = buildDiffs(timeline);

  let coverageState: MetadataIntegrityReport["coverage"]["state"] = "complete";
  let coverageNote = "Issuer account and SEP-1 declaration were both inspected.";

  if (!homeDomain || fetchOutcome !== "ok") {
    coverageState = issuerAccount.found ? "partial" : "unavailable";
    coverageNote = !issuerAccount.found
      ? "Issuer account evidence was unavailable and SEP-1 could not be compared."
      : "Issuer account evidence was read, but SEP-1 metadata was unreachable or incomplete.";
  } else if (declarationStatus === "absent") {
    coverageState = "partial";
    coverageNote = "SEP-1 was fetched but no matching currency declaration was present.";
  }

  if (timeline.length === 1 && declarationStatus === "unreachable" && !issuerAccount.found) {
    coverageState = "empty";
    coverageNote = "No comparable metadata observation could be established.";
  }

  return {
    schemaVersion: METADATA_SCHEMA_VERSION,
    evaluatedAt,
    identityKey,
    network,
    assetCode,
    issuer,
    issuerAccount,
    tomlFetch,
    declarationStatus,
    currentObservation,
    timeline,
    diffs,
    coverage: { state: coverageState, note: coverageNote },
    legitimacyVerdict: null,
    domainOwnershipClaimed: false,
    changeIsObservationNotFraud: true,
    readOnly: true,
  };
}

export { MetadataIntegrityError } from "./schema";
export type { MetadataIntegrityReport, IssuerAccountReader, TomlFetcher } from "./schema";
