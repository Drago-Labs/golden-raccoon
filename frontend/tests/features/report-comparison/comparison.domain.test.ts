import { describe, it, expect } from "vitest";
import {
  compareRiskSnapshots,
  ComparisonValidationError,
  deriveFactorSemanticKey,
  matchFactors,
  parseReasonToFactor,
} from "@/server/research/report-comparison";
import { MemoryStorageAdapter } from "@/server/storage/adapters/memory";
import {
  createFixtureRecord,
  mockAmbiguousSnapshotDoc,
  mockBaseSnapshotDoc,
  mockCrossAssetSnapshotDoc,
  mockCrossNetworkSnapshotDoc,
  mockEmptySnapshotDoc,
  mockReorderedEquivalentSnapshotDoc,
  mockTargetSnapshotDoc,
} from "./fixtures";

describe("Report Comparison Domain Engine", () => {
  it("evaluates reordered equivalent snapshots as having zero material delta", async () => {
    const result = await compareRiskSnapshots({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockReorderedEquivalentSnapshotDoc,
    });

    expect(result.factors.summary.hasMaterialDelta).toBe(false);
    expect(result.factors.summary.addedCount).toBe(0);
    expect(result.factors.summary.removedCount).toBe(0);
    expect(result.factors.summary.changedCount).toBe(0);
    expect(result.factors.summary.ambiguousCount).toBe(0);
    expect(result.factors.summary.criticalChangesCount).toBe(0);
    expect(result.scoreDelta.buyRisk.delta).toBe(0);
    expect(result.scoreDelta.confidence.delta).toBe(0);
    expect(result.scoreDelta.verdict.changed).toBe(false);
  });

  it("identifies and highlights changed critical factors with both base and target values", async () => {
    const result = await compareRiskSnapshots({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockTargetSnapshotDoc,
    });

    expect(result.factors.summary.criticalChangesCount).toBeGreaterThanOrEqual(1);
    expect(result.factors.summary.hasMaterialDelta).toBe(true);

    const criticalAuthorityItem = result.factors.items.find((item) => item.category === "authority");
    expect(criticalAuthorityItem).toBeDefined();
    expect(criticalAuthorityItem?.critical).toBe(true);
    expect(criticalAuthorityItem?.status).toBe("changed");
    expect(criticalAuthorityItem?.label).toBe("Freeze authority");
    expect(criticalAuthorityItem?.baseDetail).toContain("revocable");
    expect(criticalAuthorityItem?.targetDetail).toContain("critical honeypot risk");
    expect(criticalAuthorityItem?.impact.base).toBe(10);
    expect(criticalAuthorityItem?.impact.target).toBe(95);
    expect(criticalAuthorityItem?.impact.delta).toBe(85);
    expect(criticalAuthorityItem?.impact.state).toBe("numeric_delta");
  });

  it("computes metric deltas, verdict shifts, and maintains observation timestamps", async () => {
    const result = await compareRiskSnapshots({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockTargetSnapshotDoc,
    });

    expect(result.scoreDelta.buyRisk.base).toBe(42);
    expect(result.scoreDelta.buyRisk.target).toBe(88);
    expect(result.scoreDelta.buyRisk.delta).toBe(46);
    expect(result.scoreDelta.buyRisk.direction).toBe("increased");

    expect(result.scoreDelta.confidence.base).toBe(0.85);
    expect(result.scoreDelta.confidence.target).toBe(0.92);
    expect(result.scoreDelta.confidence.delta).toBe(0.07);
    expect(result.scoreDelta.confidence.direction).toBe("increased");

    expect(result.scoreDelta.verdict.base).toBe("manual_review");
    expect(result.scoreDelta.verdict.target).toBe("avoid");
    expect(result.scoreDelta.verdict.changed).toBe(true);

    expect(result.subject.baseObservation.generatedAt).toBe(mockBaseSnapshotDoc.freshness.generatedAt);
    expect(result.subject.targetObservation.generatedAt).toBe(mockTargetSnapshotDoc.freshness.generatedAt);
    expect(result.subject.timeElapsedSeconds).toBe(9000);
  });

  it("distinguishes unknown-to-known and known-to-unknown missing data markers from numeric shifts", async () => {
    const result = await compareRiskSnapshots({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockTargetSnapshotDoc,
    });

    expect(result.scoreDelta.missingData.unknownToKnown).toContain("historical_wash_volume");
    expect(result.scoreDelta.missingData.knownToUnknown).toEqual([]);
    expect(result.scoreDelta.missingData.removed).toHaveLength(1);
    expect(result.scoreDelta.missingData.added).toHaveLength(0);
  });

  it("detects disappearing evidence sources and asserts that missing sources are not resolved risks", async () => {
    const result = await compareRiskSnapshots({
      baseSnapshot: mockBaseSnapshotDoc,
      targetSnapshot: mockTargetSnapshotDoc,
    });

    expect(result.sources.summary.disappearedCount).toBe(1);
    const reflectorSource = result.sources.items.find((s) => s.label === "Reflector Oracle");
    expect(reflectorSource).toBeDefined();
    expect(reflectorSource?.isDisappearedRiskEvidence).toBe(true);
    expect(reflectorSource?.status).toBe("disappeared");
    expect(reflectorSource?.note).toContain("Telemetry loss does not indicate a resolved risk factor.");
    expect(result.notices.disappearingSourcesAreNotResolvedRisks).toBe(true);
  });

  it("fails closed when comparing cross-asset snapshots", async () => {
    await expect(
      compareRiskSnapshots({
        baseSnapshot: mockBaseSnapshotDoc,
        targetSnapshot: mockCrossAssetSnapshotDoc,
      }),
    ).rejects.toThrowError(ComparisonValidationError);

    try {
      await compareRiskSnapshots({
        baseSnapshot: mockBaseSnapshotDoc,
        targetSnapshot: mockCrossAssetSnapshotDoc,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ComparisonValidationError);
      expect((error as ComparisonValidationError).code).toBe("cross_asset");
    }
  });

  it("fails closed when comparing cross-network snapshots", async () => {
    try {
      await compareRiskSnapshots({
        baseSnapshot: mockBaseSnapshotDoc,
        targetSnapshot: mockCrossNetworkSnapshotDoc,
      });
      expect.unreachable("Should have rejected cross-network snapshot.");
    } catch (error) {
      expect(error).toBeInstanceOf(ComparisonValidationError);
      expect((error as ComparisonValidationError).code).toBe("cross_network");
    }
  });

  it("flags ambiguous factors when multiple items share identical semantic keys", async () => {
    const result = await compareRiskSnapshots({
      baseSnapshot: mockAmbiguousSnapshotDoc,
      targetSnapshot: mockBaseSnapshotDoc,
    });

    expect(result.factors.summary.ambiguousCount).toBeGreaterThanOrEqual(1);
    const ambiguousItem = result.factors.items.find((item) => item.status === "ambiguous");
    expect(ambiguousItem).toBeDefined();
    expect(ambiguousItem?.ambiguityReason).toContain("conflicting entries");
  });

  it("evaluates empty snapshot comparability modes properly", async () => {
    const result = await compareRiskSnapshots({
      baseSnapshot: mockEmptySnapshotDoc,
      targetSnapshot: mockEmptySnapshotDoc,
    });

    expect(result.comparability.mode).toBe("empty");
    expect(result.comparability.reasons).toContain(
      "Both baseline and target snapshots contain empty reason and evidence collections.",
    );
  });

  it("reconciles snapshots fetched by identifier from storage adapter", async () => {
    const adapter = new MemoryStorageAdapter();
    const baseRecord = createFixtureRecord("snap_base_001", mockBaseSnapshotDoc);
    const targetRecord = createFixtureRecord("snap_target_002", mockTargetSnapshotDoc);

    await adapter.createRiskSnapshot(baseRecord);
    await adapter.createRiskSnapshot(targetRecord);

    const result = await compareRiskSnapshots(
      {
        baseId: "snap_base_001",
        targetId: "snap_target_002",
      },
      { adapter },
    );

    expect(result.subject.baseObservation.id).toBe("snap_base_001");
    expect(result.subject.targetObservation.id).toBe("snap_target_002");
    expect(result.scoreDelta.buyRisk.delta).toBe(46);
  });

  it("rejects revoked and expired snapshot identifiers without writing to storage", async () => {
    const adapter = new MemoryStorageAdapter();
    const revokedRecord = createFixtureRecord("snap_revoked", mockBaseSnapshotDoc, {
      revokedAt: "2026-07-06T13:00:00.000Z",
    });
    const expiredRecord = createFixtureRecord("snap_expired", mockBaseSnapshotDoc, {
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    await adapter.createRiskSnapshot(revokedRecord);
    await adapter.createRiskSnapshot(expiredRecord);

    await expect(
      compareRiskSnapshots(
        {
          baseId: "snap_revoked",
          targetId: "snap_revoked",
        },
        { adapter },
      ),
    ).rejects.toThrowError(/revoked/i);

    await expect(
      compareRiskSnapshots(
        {
          baseId: "snap_expired",
          targetId: "snap_expired",
        },
        { adapter },
      ),
    ).rejects.toThrowError(/expired/i);
  });

  it("verifies snapshot immutability across comparison operations", async () => {
    const baseCopy = JSON.parse(JSON.stringify(mockBaseSnapshotDoc));
    const targetCopy = JSON.parse(JSON.stringify(mockTargetSnapshotDoc));

    await compareRiskSnapshots({
      baseSnapshot: baseCopy,
      targetSnapshot: targetCopy,
    });

    expect(baseCopy).toEqual(mockBaseSnapshotDoc);
    expect(targetCopy).toEqual(mockTargetSnapshotDoc);
  });

  it("parses factor reasons and extracts categories and impacts", () => {
    const factor1 = parseReasonToFactor("[authority] Freeze authority: active (impact: 85)");
    expect(factor1.category).toBe("authority");
    expect(factor1.label).toBe("Freeze authority");
    expect(factor1.impact).toBe(85);
    expect(deriveFactorSemanticKey(factor1)).toBe("authority::freeze-authority");

    const matchRes = matchFactors([factor1], [factor1]);
    expect(matchRes.summary.unchangedCount).toBe(1);
  });
});
