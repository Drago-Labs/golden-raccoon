import { describe, expect, it } from "vitest";
import { sanitizeText } from "@/server/research/social-coordination/observationAdapter";
import { CoordinationError } from "@/server/research/social-coordination/schema";
import { analyseCoordination } from "@/server/research/social-coordination/service";
import {
  duplicatesMalformedHostile,
  emptySample,
  organicSpike,
  reversedOrder,
  sparseSample,
  synchronizedCopyBurst,
} from "./fixtures";

describe("coordinated copy versus organic event", () => {
  it("finds a repeated-text cluster in the copy burst", () => {
    const report = analyseCoordination(synchronizedCopyBurst);
    const repeats = report.findings.filter((finding) => finding.kind === "repeated_text");

    expect(repeats.length).toBeGreaterThan(0);
    expect(report.clusters[0].observationIds).toHaveLength(40);
    expect(report.clusters[0].distinctAuthorCount).toBe(4);
  });

  it("finds no repeated-text cluster in the organic spike", () => {
    const report = analyseCoordination(organicSpike);

    expect(report.clusters).toHaveLength(0);
    expect(report.findings.filter((finding) => finding.kind === "repeated_text")).toHaveLength(0);
  });

  it("links every finding to the observations behind it", () => {
    const report = analyseCoordination(synchronizedCopyBurst);
    const repeat = report.findings.find((finding) => finding.kind === "repeated_text");
    const ids = new Set(report.observations.map((observation) => observation.observationId));

    expect(repeat!.supportingObservationIds.length).toBeGreaterThan(0);
    for (const id of repeat!.supportingObservationIds) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("detects a burst window against the median, not the mean", () => {
    const report = analyseCoordination(synchronizedCopyBurst);
    const bursts = report.timeline.filter((bucket) => bucket.isBurst);

    expect(bursts.length).toBeGreaterThan(0);
    expect(bursts[0].multipleOfMedian!).toBeGreaterThanOrEqual(4);
  });
});

describe("separating measurement from inference", () => {
  it("states what each finding does not establish", () => {
    const report = analyseCoordination(synchronizedCopyBurst);

    for (const finding of report.findings) {
      expect(finding.limitation).toMatch(/does not establish automation/i);
      expect(finding.limitation).toMatch(/no account is described as a bot/i);
    }
  });

  it("publishes the threshold behind every finding", () => {
    const report = analyseCoordination(synchronizedCopyBurst);

    for (const finding of report.findings) {
      expect(finding.threshold.length).toBeGreaterThan(10);
    }
    expect(report.thresholds.repeatSimilarity).toBe(0.9);
  });

  it("says a burst is also what a real news event looks like", () => {
    const report = analyseCoordination(synchronizedCopyBurst);
    const burst = report.findings.find((finding) => finding.kind === "synchronized_burst");

    expect(burst?.limitation).toMatch(/also what a genuine news event looks like/i);
  });

  it("never emits the word bot as a classification", () => {
    const report = analyseCoordination(synchronizedCopyBurst);
    const keys = new Set<string>();

    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key.toLowerCase());
          walk(child);
        }
      }
    };

    walk(report);

    for (const forbidden of ["bot", "isbot", "botscore", "coordinated", "inauthentic", "score"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});

describe("small samples and missing timestamps", () => {
  it("returns insufficient evidence rather than a confident classification", () => {
    const report = analyseCoordination(sparseSample);

    expect(report.coverage.state).toBe("insufficient");
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].strength).toBe("insufficient_evidence");
    expect(report.findings[0].limitation).toMatch(/absence of evidence, not evidence of absence/i);
  });

  it("names both published minimums it fell short of", () => {
    const report = analyseCoordination(sparseSample);

    expect(report.findings[0].measurement).toMatch(/below the published minimum of 12/i);
    expect(report.findings[0].measurement).toMatch(/below the published minimum of 5/i);
  });

  it("leaves an undated observation off the timeline rather than guessing", () => {
    const report = analyseCoordination(duplicatesMalformedHostile);

    expect(report.sampling.missingTimestampCount).toBe(1);
    expect(report.sampling.notes.join(" ")).toMatch(/manufacture synchronization/i);
    const undated = report.observations.find((observation) => observation.observationId === "no-timestamp");
    expect(undated?.postedAt).toBeNull();
  });

  it("treats a sample as non-exhaustive unless the caller says otherwise", () => {
    const report = analyseCoordination(sparseSample);

    expect(report.sampling.callerDeclaredPartial).toBe(true);
    expect(report.sampling.notes.join(" ")).toMatch(/lower bound on what exists/i);
  });
});

describe("participation counting", () => {
  it("does not let one account's repeats inflate unique participation", () => {
    const report = analyseCoordination(duplicatesMalformedHostile);
    const prolific = report.participation.find((row) => row.authorKey === "account-prolific");

    expect(prolific?.observationCount).toBe(14);
    // Fourteen posts, one participant.
    expect(report.participation.filter((row) => row.authorKey === "account-prolific")).toHaveLength(1);
  });

  it("reports concentration only above the published share", () => {
    const report = analyseCoordination(duplicatesMalformedHostile);
    const concentration = report.findings.find((finding) => finding.kind === "participation_concentration");

    expect(concentration).toBeDefined();
    expect(concentration?.measurement).toMatch(/One author account produced 14/);
    expect(concentration?.limitation).toMatch(/prolific account is not necessarily an inauthentic one/i);
  });

  it("does not assess concentration below the minimum author count", () => {
    const report = analyseCoordination(sparseSample);

    expect(report.findings.some((finding) => finding.kind === "participation_concentration")).toBe(false);
  });
});

describe("ordering and hostile content", () => {
  it("produces the same semantic result whatever the input order", () => {
    const forward = analyseCoordination(synchronizedCopyBurst);
    const reversed = analyseCoordination(reversedOrder);

    expect(reversed.clusters).toEqual(forward.clusters);
    expect(reversed.findings).toEqual(forward.findings);
    expect(reversed.participation).toEqual(forward.participation);
  });

  it("strips markup and invisible characters from observation text", () => {
    const report = analyseCoordination(duplicatesMalformedHostile);
    const hostile = report.observations.find((observation) => observation.observationId === "hostile-markup");

    expect(hostile?.text).not.toContain("<script>");
    expect(hostile?.text).not.toContain("‮");
  });

  it("keeps an unanalysable observation listed with its reason", () => {
    const report = analyseCoordination(duplicatesMalformedHostile);
    const empty = report.observations.find((observation) => observation.observationId === "empty-text");

    expect(empty?.excludedReason).toMatch(/carries no text/i);
    expect(report.sampling.excludedCount).toBeGreaterThan(0);
  });

  it("sanitizes text without leaving markup behind", () => {
    expect(sanitizeText("<b>hi</b> there")).toBe("hi there");
  });
});

describe("score independence", () => {
  it("declares that no score or recommendation changed", () => {
    expect(analyseCoordination(synchronizedCopyBurst).scoreUnchanged).toBe(true);
  });

  it("does not mutate the supplied request", () => {
    const before = JSON.stringify(synchronizedCopyBurst);
    analyseCoordination(synchronizedCopyBurst);
    expect(JSON.stringify(synchronizedCopyBurst)).toBe(before);
  });
});

describe("coverage states", () => {
  it("distinguishes complete, partial, insufficient and empty", () => {
    expect(analyseCoordination(synchronizedCopyBurst).coverage.state).toBe("complete");
    expect(analyseCoordination(duplicatesMalformedHostile).coverage.state).toBe("partial");
    expect(analyseCoordination(sparseSample).coverage.state).toBe("insufficient");
    expect(analyseCoordination(emptySample).coverage.state).toBe("empty");
  });

  it("treats an empty sample as a valid result", () => {
    const report = analyseCoordination(emptySample);

    expect(report.findings).toHaveLength(0);
    expect(report.coverage.note).toMatch(/nothing to analyse/i);
  });
});

describe("validation", () => {
  it("rejects an unreadable observation time", () => {
    expect(() => analyseCoordination({ observedAt: "not-a-date", observations: [] })).toThrow(CoordinationError);
  });

  it("rejects an observation with no author key", () => {
    expect(() =>
      analyseCoordination({
        observedAt: "2026-01-05T12:00:00.000Z",
        observations: [{ observationId: "x", authorKey: "" }],
      }),
    ).toThrow(CoordinationError);
  });
});
