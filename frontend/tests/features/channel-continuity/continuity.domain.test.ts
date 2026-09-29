import { describe, expect, it } from "vitest";
import { ContinuityError } from "@/server/research/channel-continuity/schema";
import { inspectChannelContinuity } from "@/server/research/channel-continuity/service";
import { sanitizeText } from "@/server/research/channel-continuity/observationAdapter";
import {
  brokenLinkSeries,
  emptySample,
  hostileMarkup,
  missingArchiveAndSourceFailure,
  redirectAndDomainChurn,
  sameSymbolSeparateIssuers,
  unsafePrivateRedirect,
} from "./fixtures";

describe("channel continuity domain", () => {
  it("records redirects and domain churn as evidence, not takeover proof", () => {
    const report = inspectChannelContinuity(redirectAndDomainChurn);

    expect(report.scoreUnchanged).toBe(true);
    expect(report.events.some((event) => event.kind === "redirect")).toBe(true);
    expect(report.events.some((event) => event.kind === "domain_change")).toBe(true);
    expect(report.events.some((event) => event.kind === "handle_change")).toBe(true);
    expect(report.events.every((event) => /not proof of takeover/i.test(event.limitation))).toBe(true);
    expect(report.findings.every((finding) => /not establish/i.test(finding.limitation) || /not identity/i.test(finding.limitation))).toBe(
      true,
    );
  });

  it("keeps same-symbol tokens and lookalike domains on separate identity keys", () => {
    const report = inspectChannelContinuity(sameSymbolSeparateIssuers);

    expect(report.subjects).toHaveLength(2);
    expect(report.subjects[0].identityKey).not.toBe(report.subjects[1].identityKey);
    expect(report.subjects.map((subject) => subject.symbol)).toEqual(["ACME", "ACME"]);

    const lookalike = report.observations.find((observation) => observation.observationId === "lookalike-site");
    expect(lookalike?.claimKind).toBe("ambiguous");
    expect(report.findings.some((finding) => finding.kind === "identity_uncertainty")).toBe(true);

    // No continuity event merges the two subjects.
    expect(report.events.every((event) => event.identityKey === report.subjects[0].identityKey || event.identityKey === report.subjects[1].identityKey)).toBe(
      true,
    );
    expect(new Set(report.observations.map((observation) => observation.identityKey)).size).toBe(2);
  });

  it("lists missing archives and source failures without inventing channel state", () => {
    const report = inspectChannelContinuity(missingArchiveAndSourceFailure);

    expect(report.events.some((event) => event.kind === "missing_archive")).toBe(true);
    expect(report.events.some((event) => event.kind === "source_failure")).toBe(true);

    const missing = report.observations.find((observation) => observation.observationId === "alpha-missing");
    const failed = report.observations.find((observation) => observation.observationId === "alpha-failed");
    expect(missing?.excludedReason).toMatch(/archive/i);
    expect(failed?.excludedReason).toMatch(/source failed/i);
    expect(report.coverage.state).toBe("partial");
    expect(report.sourceCoverage.some((row) => row.missingArchiveCount > 0)).toBe(true);
    expect(report.sourceCoverage.some((row) => row.failedCount > 0)).toBe(true);
  });

  it("blocks private-network URLs and unsafe redirects without fetching them", () => {
    const report = inspectChannelContinuity(unsafePrivateRedirect);

    const blocked = report.observations.find((observation) => observation.observationId === "alpha-ssrf");
    expect(blocked?.fetchOutcome).toBe("blocked_unsafe");
    expect(blocked?.urlSafety.safe).toBe(false);
    expect(blocked?.urlSafety.issues.join(" ")).toMatch(/private|localhost/i);
    expect(report.events.some((event) => event.kind === "blocked_unsafe")).toBe(true);
    expect(report.coverage.blockedUnsafeCount).toBeGreaterThan(0);
  });

  it("reports a broken link as evidence", () => {
    const report = inspectChannelContinuity(brokenLinkSeries);

    expect(report.events.some((event) => event.kind === "broken_link")).toBe(true);
    expect(report.crossLinks).toEqual([]);
  });

  it("builds a cross-link table from redirects-and-churn fixture", () => {
    const report = inspectChannelContinuity(redirectAndDomainChurn);

    expect(report.crossLinks.length).toBeGreaterThan(0);
    expect(report.crossLinks.every((edge) => typeof edge.toUrl === "string")).toBe(true);
    expect(report.timeline.length).toBeGreaterThan(0);
  });

  it("returns a distinguishable empty report", () => {
    const report = inspectChannelContinuity(emptySample);

    expect(report.coverage.state).toBe("empty");
    expect(report.events).toHaveLength(0);
    expect(report.scoreUnchanged).toBe(true);
  });

  it("strips markup from snapshots and display names", () => {
    const report = inspectChannelContinuity(hostileMarkup);
    const hostile = report.observations[0];

    expect(hostile.displayName).not.toContain("<script>");
    expect(hostile.sourceSnapshot).not.toContain("<b>");
    expect(sanitizeText("<script>x</script>")).toBe("x");
  });

  it("rejects an unreadable observation time", () => {
    expect(() => inspectChannelContinuity({ ...emptySample, observedAt: "not-a-date" })).toThrow(ContinuityError);
  });

  it("rejects colliding subject identities that would merge same-symbol tokens", () => {
    expect(() =>
      inspectChannelContinuity({
        observedAt: "2026-03-01T12:00:00.000Z",
        subjects: [
          { subjectId: "a", chainId: "stellar:pubnet", symbol: "ACME", issuer: "GISSUER" },
          { subjectId: "b", chainId: "stellar:pubnet", symbol: "ACME", issuer: "GISSUER" },
        ],
        observations: [],
      }),
    ).toThrow(/same-symbol/i);
  });

  it("never invents official status from ambiguous claims", () => {
    const report = inspectChannelContinuity(sameSymbolSeparateIssuers);
    const keys = JSON.stringify(Object.keys(report).sort());

    expect(keys).not.toMatch(/isOfficial|officialChannel|fraudScore|takeoverScore/);
    expect(report.scoreUnchanged).toBe(true);
    expect(report.observations.every((observation) => observation.claimKind !== undefined)).toBe(true);
  });
});
