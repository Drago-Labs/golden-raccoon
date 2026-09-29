import { describe, expect, it } from "vitest";
import { buildMetadataIdentityKey } from "@/server/research/metadata-integrity/identityKey";
import { matchCurrencyDeclaration } from "@/server/research/metadata-integrity/matching";
import { buildDiffs, sortTimeline } from "@/server/research/metadata-integrity/observations";
import { inspectMetadataIntegrity } from "@/server/research/metadata-integrity/service";
import { probeTomlUrlSafety } from "@/server/research/metadata-integrity/tomlFetch";
import { parseSep1Toml } from "@/server/stellar/assetIdentity";
import {
  ABSENT_TOML,
  CONFLICTING_TOML,
  EXPIRED_TOML,
  ISSUER_A,
  ISSUER_B,
  MATCHING_TOML,
  createIssuerReader,
  createTomlFetcher,
  priorObservation,
  request,
} from "./fixtures";

describe("identity scoping", () => {
  it("keeps the same symbol distinct across testnet and pubnet", () => {
    const pubnet = buildMetadataIdentityKey({ network: "pubnet", assetCode: "USDC", issuer: ISSUER_A });
    const testnet = buildMetadataIdentityKey({ network: "testnet", assetCode: "USDC", issuer: ISSUER_A });

    expect(pubnet).not.toBe(testnet);
    expect(pubnet).toContain(":pubnet:");
    expect(testnet).toContain(":testnet:");
  });

  it("keeps symbol collisions distinct by issuer", () => {
    const left = buildMetadataIdentityKey({ network: "pubnet", assetCode: "USDC", issuer: ISSUER_A });
    const right = buildMetadataIdentityKey({ network: "pubnet", assetCode: "USDC", issuer: ISSUER_B });

    expect(left).not.toBe(right);
  });
});

describe("declaration matching", () => {
  it("matches when code and issuer appear together", () => {
    const parsed = parseSep1Toml(MATCHING_TOML);
    const match = matchCurrencyDeclaration(parsed.currencies, { code: "USDC", issuer: ISSUER_A }, "ok");

    expect(match.status).toBe("matched");
    expect(match.matchingCurrency?.name).toBe("USD Coin");
  });

  it("flags a conflicting issuer for the same code", () => {
    const parsed = parseSep1Toml(CONFLICTING_TOML);
    const match = matchCurrencyDeclaration(parsed.currencies, { code: "USDC", issuer: ISSUER_A }, "ok");

    expect(match.status).toBe("conflicting");
    expect(match.conflictingCurrency?.issuer).toBe(ISSUER_B);
  });

  it("reports absent when the issuer lists a different code", () => {
    const parsed = parseSep1Toml(ABSENT_TOML);
    const match = matchCurrencyDeclaration(parsed.currencies, { code: "USDC", issuer: ISSUER_A }, "ok");

    expect(match.status).toBe("absent");
  });

  it("reports expired for a retired currency status", () => {
    const parsed = parseSep1Toml(EXPIRED_TOML);
    const match = matchCurrencyDeclaration(parsed.currencies, { code: "USDC", issuer: ISSUER_A }, "ok");

    expect(match.status).toBe("expired");
  });

  it("reports unreachable when the fetch did not succeed", () => {
    const match = matchCurrencyDeclaration(undefined, { code: "USDC", issuer: ISSUER_A }, "timeout");

    expect(match.status).toBe("unreachable");
  });
});

describe("inspectMetadataIntegrity", () => {
  it("returns a matched observation without claiming domain ownership or fraud", async () => {
    const report = await inspectMetadataIntegrity(request(), {
      readIssuer: createIssuerReader(),
      fetchToml: createTomlFetcher({ body: MATCHING_TOML }),
    });

    expect(report.declarationStatus).toBe("matched");
    expect(report.domainOwnershipClaimed).toBe(false);
    expect(report.legitimacyVerdict).toBeNull();
    expect(report.changeIsObservationNotFraud).toBe(true);
    expect(report.currentObservation.domainOwnershipClaimed).toBe(false);
    expect(report.currentObservation.contentHash).toHaveLength(64);
    expect(report.currentObservation.exactLinks.stellarTomlUrl).toContain("stellar.toml");
    expect(report.issuerAccount.horizonAccountUrl).toContain(ISSUER_A);
  });

  it("surfaces conflicting declarations as observations, not fraud", async () => {
    const report = await inspectMetadataIntegrity(request(), {
      readIssuer: createIssuerReader(),
      fetchToml: createTomlFetcher({ body: CONFLICTING_TOML }),
    });

    expect(report.declarationStatus).toBe("conflicting");
    expect(report.changeIsObservationNotFraud).toBe(true);
    expect(report.legitimacyVerdict).toBeNull();
  });

  it("builds a timeline and diff when prior observations drift", async () => {
    const prior = priorObservation({
      observedAt: "2026-02-01T12:00:00.000Z",
      snapshot: {
        name: "Old Name",
        description: "Old description",
        orgUrl: "https://old.example.com",
        image: "https://example.com/old.png",
        status: "live",
        code: "USDC",
        issuer: ISSUER_A,
        homeDomain: "example.com",
        tomlUrl: "https://example.com/.well-known/stellar.toml",
      },
    });

    const report = await inspectMetadataIntegrity(request({ priorObservations: [prior] }), {
      readIssuer: createIssuerReader(),
      fetchToml: createTomlFetcher({ body: MATCHING_TOML }),
    });

    expect(report.timeline).toHaveLength(2);
    expect(sortTimeline(report.timeline)[0].observedAt).toBe("2026-02-01T12:00:00.000Z");
    expect(report.diffs).toHaveLength(1);
    expect(report.diffs[0].changeIsObservationNotFraud).toBe(true);

    const changed = report.diffs[0].rows.filter((row) => row.changed);
    expect(changed.some((row) => row.field === "name")).toBe(true);
    expect(changed.some((row) => row.field === "orgUrl")).toBe(true);
    expect(buildDiffs(report.timeline)).toHaveLength(1);
  });

  it("ignores prior observations from a different network identity", async () => {
    const otherNetwork = priorObservation({
      network: "testnet",
      identityKey: buildMetadataIdentityKey({ network: "testnet", assetCode: "USDC", issuer: ISSUER_A }),
    });

    const report = await inspectMetadataIntegrity(request({ priorObservations: [otherNetwork] }), {
      readIssuer: createIssuerReader(),
      fetchToml: createTomlFetcher({ body: MATCHING_TOML }),
    });

    expect(report.timeline).toHaveLength(1);
    expect(report.diffs).toHaveLength(0);
  });

  it("fails safely when the TOML fetch times out", async () => {
    const report = await inspectMetadataIntegrity(request(), {
      readIssuer: createIssuerReader(),
      fetchToml: createTomlFetcher({
        outcome: "timeout",
        body: null,
        issues: ["The operation was aborted"],
      }),
    });

    expect(report.declarationStatus).toBe("unreachable");
    expect(report.tomlFetch.outcome).toBe("timeout");
    expect(report.coverage.state).toBe("partial");
  });

  it("fails safely when the home domain is missing", async () => {
    const report = await inspectMetadataIntegrity(request({ homeDomain: undefined }), {
      readIssuer: createIssuerReader({ homeDomain: null }),
      fetchToml: createTomlFetcher({ body: MATCHING_TOML }),
    });

    expect(report.tomlFetch.outcome).toBe("missing_home_domain");
    expect(report.declarationStatus).toBe("unreachable");
  });

  it("rejects an invalid issuer before any I/O", async () => {
    await expect(
      inspectMetadataIntegrity(request({ issuer: "not-an-account" }), {
        readIssuer: createIssuerReader(),
        fetchToml: createTomlFetcher({ body: MATCHING_TOML }),
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("URL safety probes", () => {
  it("blocks private and non-HTTPS stellar.toml targets", () => {
    expect(probeTomlUrlSafety("http://example.com/.well-known/stellar.toml").allowed).toBe(false);
    expect(probeTomlUrlSafety("https://127.0.0.1/.well-known/stellar.toml").allowed).toBe(false);
    expect(probeTomlUrlSafety("https://10.0.0.1/.well-known/stellar.toml").allowed).toBe(false);
    expect(probeTomlUrlSafety("https://localhost/.well-known/stellar.toml").allowed).toBe(false);
    expect(probeTomlUrlSafety("https://example.com/.well-known/stellar.toml").allowed).toBe(true);
  });

  it("reports oversized TOML through the fetcher outcome", async () => {
    const report = await inspectMetadataIntegrity(request(), {
      readIssuer: createIssuerReader(),
      fetchToml: createTomlFetcher({
        outcome: "oversized",
        body: null,
        byteLength: 500_000,
        issues: ["SEP-1 response size limit exceeded"],
      }),
    });

    expect(report.tomlFetch.outcome).toBe("oversized");
    expect(report.declarationStatus).toBe("unreachable");
  });

  it("reports redirect blocks without inventing a declaration match", async () => {
    const report = await inspectMetadataIntegrity(request(), {
      readIssuer: createIssuerReader(),
      fetchToml: createTomlFetcher({
        outcome: "redirect_blocked",
        body: null,
        redirectCount: 3,
        issues: ["SEP-1 redirect limit exceeded"],
      }),
    });

    expect(report.tomlFetch.outcome).toBe("redirect_blocked");
    expect(report.declarationStatus).toBe("unreachable");
  });
});
