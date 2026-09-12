import { describe, expect, it } from "vitest";
import { fingerprintReason } from "@/server/research/report-comparison/factorMatching";
import { ComparisonError } from "@/server/research/report-comparison/schema";
import { compareSnapshots } from "@/server/research/report-comparison/service";
import {
  ALL_RECORDS,
  addedRemovedAmbiguousPair,
  crossAssetRecord,
  crossNetworkRecord,
  emptyPair,
  expiredRecord,
  reorderedEquivalentPair,
  revokedRecord,
  stubAdapter,
  tamperedRecord,
} from "./fixtures";

const adapter = stubAdapter(ALL_RECORDS);

function compare(leftId: string, rightId: string) {
  return compareSnapshots({ leftId, rightId }, adapter);
}

async function expectFailure(leftId: string, rightId: string, code: string) {
  let thrown: unknown;

  try {
    await compare(leftId, rightId);
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(ComparisonError);
  expect((thrown as ComparisonError).code).toBe(code);
}

describe("reordered equivalent snapshots", () => {
  it("reports no material delta", async () => {
    const comparison = await compare(reorderedEquivalentPair.left.id, reorderedEquivalentPair.right.id);

    expect(comparison.materiallyIdentical).toBe(true);
    expect(comparison.scores.every((delta) => delta.direction === "unchanged")).toBe(true);
    expect(comparison.verdict.changed).toBe(false);
    expect(comparison.factors.every((factor) => factor.status === "unchanged")).toBe(true);
    expect(comparison.sources.every((source) => source.status === "unchanged")).toBe(true);
  });

  it("orders the pair by observation time regardless of argument order", async () => {
    const forward = await compare(reorderedEquivalentPair.left.id, reorderedEquivalentPair.right.id);
    const reversed = await compare(reorderedEquivalentPair.right.id, reorderedEquivalentPair.left.id);

    expect(forward.left.snapshotId).toBe(reversed.left.snapshotId);
    expect(forward.right.snapshotId).toBe(reversed.right.snapshotId);
  });
});

describe("narrative matching", () => {
  it("classifies added, removed, changed and ambiguous items", async () => {
    const comparison = await compare(addedRemovedAmbiguousPair.left.id, addedRemovedAmbiguousPair.right.id);
    const byStatus = (status: string) => comparison.factors.filter((factor) => factor.status === status);

    expect(byStatus("added").length).toBeGreaterThan(0);
    expect(byStatus("removed").length).toBeGreaterThan(0);
    expect(byStatus("ambiguous").length).toBeGreaterThan(0);
  });

  it("refuses to guess when two reasons share a fingerprint", async () => {
    const comparison = await compare(addedRemovedAmbiguousPair.left.id, addedRemovedAmbiguousPair.right.id);
    const ambiguous = comparison.factors.find((factor) => factor.status === "ambiguous");

    expect(ambiguous?.candidates?.length).toBeGreaterThan(1);
    expect(ambiguous?.note).toMatch(/cannot be established/i);
  });

  it("ignores word order and punctuation when fingerprinting a reason", () => {
    expect(fingerprintReason("Liquidity is thin.")).toBe(fingerprintReason("thin liquidity"));
    expect(fingerprintReason("Owner can mint")).not.toBe(fingerprintReason("Owner renounced"));
  });

  it("reports a widened missing-data gap as a change, not an improvement", async () => {
    const comparison = await compare(addedRemovedAmbiguousPair.left.id, addedRemovedAmbiguousPair.right.id);
    const lpLock = comparison.missingData.find((entry) => entry.field === "lp_lock");

    expect(lpLock?.status).toBe("changed");
    expect(lpLock?.leftImpact).toBe("medium");
    expect(lpLock?.rightImpact).toBe("high");

    const holderList = comparison.missingData.find((entry) => entry.field === "holder_list");
    expect(holderList?.status).toBe("added");
    expect(holderList?.note).toMatch(/visibility decreased/i);
  });
});

describe("evidence loss", () => {
  it("never presents a vanished source as a resolved risk", async () => {
    const comparison = await compare(addedRemovedAmbiguousPair.left.id, addedRemovedAmbiguousPair.right.id);

    const removed = comparison.sources.find((source) => source.label === "DexScreener");
    expect(removed?.status).toBe("removed");
    expect(removed?.evidenceLost).toBe(true);
    expect(removed?.note).toMatch(/not as a cleared risk/i);

    const degraded = comparison.sources.find((source) => source.label === "GoPlus");
    expect(degraded?.evidenceLost).toBe(true);
    expect(degraded?.leftStatus).toBe("connected");
    expect(degraded?.rightStatus).toBe("unavailable");
  });

  it("distinguishes a lost value from a numeric decrease", async () => {
    const comparison = await compare(addedRemovedAmbiguousPair.left.id, addedRemovedAmbiguousPair.right.id);
    const degraded = comparison.sources.find((source) => source.label === "GoPlus");

    expect(degraded?.freshnessDelta?.direction).toBe("known_to_unknown");
    expect(degraded?.freshnessDelta?.note).toMatch(/not a measured decrease/i);
    expect(degraded?.reliabilityDelta?.direction).toBe("decrease");
  });

  it("reports coverage as partial when evidence was lost", async () => {
    const comparison = await compare(addedRemovedAmbiguousPair.left.id, addedRemovedAmbiguousPair.right.id);

    expect(comparison.coverage.state).toBe("partial");
    expect(comparison.coverage.lostSources).toBeGreaterThan(0);
  });
});

describe("score deltas", () => {
  it("reports a real numeric change with both source values", async () => {
    const comparison = await compare(addedRemovedAmbiguousPair.left.id, addedRemovedAmbiguousPair.right.id);
    const buyRisk = comparison.scores.find((delta) => delta.field === "buyRisk");

    expect(buyRisk?.left).toBe(60);
    expect(buyRisk?.right).toBe(74);
    expect(buyRisk?.direction).toBe("increase");
    expect(comparison.verdict.changed).toBe(true);
  });
});

describe("guards", () => {
  it("refuses a cross-network pair", async () => {
    await expectFailure(reorderedEquivalentPair.left.id, crossNetworkRecord.id, "cross_network");
  });

  it("refuses a cross-asset pair", async () => {
    await expectFailure(reorderedEquivalentPair.left.id, crossAssetRecord.id, "cross_asset");
  });

  it("refuses an expired snapshot through the existing integrity gate", async () => {
    await expectFailure(reorderedEquivalentPair.left.id, expiredRecord.id, "expired");
  });

  it("refuses a tampered snapshot", async () => {
    await expectFailure(reorderedEquivalentPair.left.id, tamperedRecord.id, "tampered");
  });

  it("refuses a revoked snapshot", async () => {
    await expectFailure(reorderedEquivalentPair.left.id, revokedRecord.id, "revoked");
  });

  it("refuses an unknown snapshot id", async () => {
    await expectFailure(reorderedEquivalentPair.left.id, "snapshot_does-not-exist", "not_found");
  });

  it("refuses comparing a snapshot with itself", async () => {
    await expectFailure(reorderedEquivalentPair.left.id, reorderedEquivalentPair.left.id, "invalid_request");
  });

  it("refuses an id that is not shaped like a snapshot id", async () => {
    await expectFailure("../../etc/passwd", reorderedEquivalentPair.right.id, "invalid_request");
  });
});

describe("empty results", () => {
  it("distinguishes a valid empty comparison from a failure", async () => {
    const comparison = await compare(emptyPair.left.id, emptyPair.right.id);

    expect(comparison.coverage.state).toBe("empty");
    expect(comparison.coverage.note).toMatch(/nothing to compare/i);
    expect(comparison.materiallyIdentical).toBe(true);
  });
});

describe("read-only guarantee", () => {
  it("performs no snapshot write of any kind", async () => {
    const calls: string[] = [];
    const base = stubAdapter(ALL_RECORDS);
    const spy = new Proxy(base, {
      get(target, property) {
        calls.push(String(property));
        return Reflect.get(target, property);
      },
    });

    await compareSnapshots(
      { leftId: reorderedEquivalentPair.left.id, rightId: reorderedEquivalentPair.right.id },
      spy,
    );

    expect(calls).toContain("getRiskSnapshot");
    expect(calls).not.toContain("createRiskSnapshot");
    expect(calls).not.toContain("revokeRiskSnapshot");
  });

  it("preserves both observation times", async () => {
    const comparison = await compare(reorderedEquivalentPair.left.id, reorderedEquivalentPair.right.id);

    expect(comparison.left.generatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(comparison.right.generatedAt).toBe("2026-01-08T00:00:00.000Z");
    expect(comparison.left.expiresAt).toBeTruthy();
    expect(comparison.right.expiresAt).toBeTruthy();
  });
});
