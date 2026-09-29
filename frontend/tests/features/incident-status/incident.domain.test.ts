import { describe, expect, it } from "vitest";
import { IncidentError } from "@/server/research/incident-status/schema";
import { analyseIncidentStatus } from "@/server/research/incident-status/service";
import {
  conflictingOfficialSources,
  duplicateArticles,
  emptyIncident,
  rumorCannotAcknowledge,
  sameNameDifferentChain,
  statusRevisionOfficial,
  staleUpdate,
} from "./fixtures";

describe("authority rules", () => {
  it("does not let an unverified rumor become an official acknowledgement", () => {
    const report = analyseIncidentStatus(rumorCannotAcknowledge);
    const rumor = report.documents.find((document) => document.documentId === "rumor-1");

    expect(rumor?.claimedStatus).toBe("acknowledged");
    expect(rumor?.effectiveStatus).toBe("reported");
    expect(rumor?.statusReason).toMatch(/cannot become an official acknowledgement/i);
    expect(report.scoreUnchanged).toBe(true);
  });

  it("records official acknowledgement and mitigation transitions with support", () => {
    const report = analyseIncidentStatus(statusRevisionOfficial);
    const statuses = report.transitions.map((transition) => transition.toStatus);

    expect(statuses).toContain("acknowledged");
    expect(statuses).toContain("mitigated");
    expect(report.transitions.some((transition) => transition.toStatus === "acknowledged" && transition.officiallySupported)).toBe(
      true,
    );
    expect(report.transitions.some((transition) => transition.toStatus === "mitigated" && transition.officiallySupported)).toBe(true);
  });
});

describe("provenance", () => {
  it("treats duplicate articles on the same canonical URL as syndicated copies", () => {
    const report = analyseIncidentStatus(duplicateArticles);
    const copy = report.documents.find((document) => document.documentId === "wire-copy");

    expect(copy?.role).toBe("syndicated_copy");
    expect(report.coverage.syndicatedCopyCount).toBeGreaterThanOrEqual(1);
    expect(report.coverage.independentOfficialCount).toBe(0);
  });
});

describe("identity and disagreements", () => {
  it("keeps same-name projects on different networks distinct", () => {
    expect(() => analyseIncidentStatus(sameNameDifferentChain)).toThrow(IncidentError);

    try {
      analyseIncidentStatus(sameNameDifferentChain);
    } catch (error) {
      expect(error).toBeInstanceOf(IncidentError);
      expect((error as IncidentError).code).toBe("subject_mismatch");
    }
  });

  it("surfaces conflicting official sources without picking a winner", () => {
    const report = analyseIncidentStatus(conflictingOfficialSources);

    expect(report.disagreements.some((entry) => entry.reason === "conflicting_official")).toBe(true);
    expect(report.coverage.state).toBe("disputed");
    expect(report.coverage.note).toMatch(/source claims, not ground truth/i);
  });

  it("marks stale updates and missing follow-up explicitly", () => {
    const report = analyseIncidentStatus(staleUpdate);
    const document = report.documents[0];

    expect(document.stale).toBe(true);
    expect(document.staleReason).toMatch(/freshness window/i);
    expect(report.disagreements.some((entry) => entry.reason === "missing_follow_up")).toBe(true);
    expect(report.coverage.state).toBe("partial");
  });

  it("returns a distinguishable empty result", () => {
    const report = analyseIncidentStatus(emptyIncident);

    expect(report.coverage.state).toBe("empty");
    expect(report.documents).toHaveLength(0);
    expect(report.timeline).toHaveLength(0);
  });

  it("never invents score or outbound URL fields", () => {
    const report = analyseIncidentStatus(statusRevisionOfficial);
    const encoded = JSON.stringify(report);

    expect(encoded).not.toMatch(/"buyRisk"|"verdict"|"href"|"endpoint"/);
    expect(report.scoreUnchanged).toBe(true);
  });
});
