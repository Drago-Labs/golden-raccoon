import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ScoreDeltaTable,
  FactorChanges,
  SourceChanges,
  SnapshotSelector,
  ReportComparison,
} from "@/components/research/report-comparison";
import type { ReportComparisonDocument } from "@/server/research/report-comparison/schema";

const mockComparisonDocument: ReportComparisonDocument = {
  schemaVersion: "report-comparison/2026-01",
  subject: {
    symbol: "USDC",
    chainFamily: "stellar",
    network: "testnet",
    canonicalIdentity: "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    timeElapsedSeconds: 9000,
    baseObservation: {
      id: "base_001",
      generatedAt: "2026-07-06T12:00:00.000Z",
      staleAt: "2026-07-07T00:00:00.000Z",
      canonicalHash: "hash_base",
    },
    targetObservation: {
      id: "target_002",
      generatedAt: "2026-07-06T14:30:00.000Z",
      staleAt: "2026-07-07T02:30:00.000Z",
      canonicalHash: "hash_target",
    },
  },
  comparability: {
    mode: "complete",
    reasons: [],
    baseVersion: "1",
    targetVersion: "1",
    baseObservationTime: "2026-07-06T12:00:00.000Z",
    targetObservationTime: "2026-07-06T14:30:00.000Z",
  },
  scoreDelta: {
    buyRisk: {
      base: 42,
      target: 88,
      delta: 46,
      direction: "increased",
    },
    confidence: {
      base: 0.85,
      target: 0.92,
      delta: 0.07,
      direction: "increased",
    },
    verdict: {
      base: "manual_review",
      target: "avoid",
      changed: true,
      direction: "degraded",
    },
    missingData: {
      added: [],
      removed: [{ field: "historical_wash_volume", impact: "low" }],
      retained: [],
      totalBase: 1,
      totalTarget: 0,
      unknownToKnown: ["historical_wash_volume"],
      knownToUnknown: [],
    },
  },
  factors: {
    items: [
      {
        key: "authority::freeze-authority",
        label: "Freeze authority",
        category: "authority",
        status: "changed",
        critical: true,
        severity: {
          base: "info",
          target: "critical",
          changed: true,
        },
        impact: {
          base: 10,
          target: 95,
          delta: 85,
          state: "numeric_delta",
        },
        baseDetail: "revocable (impact: 10)",
        targetDetail: "enabled and active: critical honeypot risk (impact: 95)",
      },
      {
        key: "governance::multi-sig-signers",
        label: "Multi-sig signers",
        category: "governance",
        status: "added",
        critical: false,
        severity: {
          target: "medium",
          changed: false,
        },
        impact: {
          base: null,
          target: 50,
          delta: null,
          state: "unknown_to_known",
        },
        targetDetail: "reduced from 3 to 1",
      },
    ],
    summary: {
      addedCount: 1,
      removedCount: 0,
      changedCount: 1,
      unchangedCount: 0,
      ambiguousCount: 0,
      criticalChangesCount: 1,
      hasMaterialDelta: true,
    },
  },
  sources: {
    items: [
      {
        label: "Horizon RPC",
        baseStatus: "connected",
        targetStatus: "connected",
        baseCheckedAt: "2026-07-06T12:00:00.000Z",
        targetCheckedAt: "2026-07-06T14:30:00.000Z",
        freshnessDeltaSeconds: 9000,
        reliabilityDelta: 0.03,
        status: "fresh",
        isDisappearedRiskEvidence: false,
      },
      {
        label: "Reflector Oracle",
        baseStatus: "connected",
        targetStatus: "unavailable",
        baseCheckedAt: "2026-07-06T12:00:00.000Z",
        targetCheckedAt: "2026-07-06T14:30:00.000Z",
        freshnessDeltaSeconds: 9000,
        reliabilityDelta: -0.9,
        status: "disappeared",
        isDisappearedRiskEvidence: true,
        note: "Source transitioned from connected to unavailable. Telemetry loss does not indicate a resolved risk factor.",
      },
    ],
    summary: {
      connectedBaseSources: 2,
      connectedTargetSources: 1,
      totalBaseSources: 2,
      totalTargetSources: 2,
      disappearedCount: 1,
      reconnectedCount: 0,
      freshCount: 1,
      staleCount: 0,
      addedCount: 0,
      removedCount: 0,
      unchangedCount: 0,
    },
  },
  notices: {
    disappearingSourcesAreNotResolvedRisks: true,
    disclaimer: "Semantic comparison is advisory.",
  },
  summary: "Buy risk elevated due to active freeze authority honeypot.",
};

describe("Report Comparison Component Suite", () => {
  it("renders metrics, score deltas, and verdict shifts in ScoreDeltaTable", () => {
    render(
      <ScoreDeltaTable
        scoreDelta={mockComparisonDocument.scoreDelta}
        subject={mockComparisonDocument.subject}
      />,
    );

    expect(screen.getByText(/Buy Risk Score/i)).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("88")).toBeDefined();
    expect(screen.getByText(/\+46 points/i)).toBeDefined();

    expect(screen.getByText(/Model Confidence/i)).toBeDefined();
    expect(screen.getByText(/85\.0%/)).toBeDefined();
    expect(screen.getByText(/92\.0%/)).toBeDefined();
    expect(screen.getByText(/\+7\.0%/)).toBeDefined();

    expect(screen.getByText("MANUAL REVIEW")).toBeDefined();
    expect(screen.getByText("AVOID")).toBeDefined();
    expect(screen.getByText(/Shifted Verdict/i)).toBeDefined();

    expect(screen.getByText(/historical_wash_volume/i)).toBeDefined();
  });

  it("renders critical factor card with both baseline and target values in FactorChanges", () => {
    render(<FactorChanges factors={mockComparisonDocument.factors} />);

    expect(screen.getAllByText(/Freeze authority/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Critical Risk Factor Modifications/i)).toBeDefined();
    expect(screen.getAllByText(/revocable \(impact: 10\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/critical honeypot risk/i).length).toBeGreaterThanOrEqual(1);

    const criticalButton = screen.getByRole("button", { name: /^Critical \(/i });
    fireEvent.click(criticalButton);
    expect(screen.getAllByText(/Freeze authority/i).length).toBeGreaterThanOrEqual(1);

    const addedButton = screen.getByRole("button", { name: /^Added \(/i });
    fireEvent.click(addedButton);
    expect(screen.getByText(/Multi-sig signers/i)).toBeDefined();
  });

  it("renders disappearing source warning banner and status badges in SourceChanges", () => {
    render(<SourceChanges sources={mockComparisonDocument.sources} />);

    expect(screen.getByText(/Critical Telemetry Warning/i)).toBeDefined();
    expect(screen.getByText(/A disappearing source must never be interpreted as a resolved risk/i)).toBeDefined();

    expect(screen.getByText("Horizon RPC")).toBeDefined();
    expect(screen.getByText("Reflector Oracle")).toBeDefined();
    expect(screen.getByText("Disappeared Signal")).toBeDefined();
  });

  it("allows inputting identifiers, swapping base and target, and submitting comparison", () => {
    const handleCompare = vi.fn();
    const { container } = render(
      <SnapshotSelector
        initialBaseId="snap_alpha"
        initialTargetId="snap_beta"
        isLoading={false}
        onCompare={handleCompare}
      />,
    );

    const baseInput = container.querySelector("#baseId") as HTMLInputElement;
    const targetInput = container.querySelector("#targetId") as HTMLInputElement;

    expect(baseInput.value).toBe("snap_alpha");
    expect(targetInput.value).toBe("snap_beta");

    const swapButton = screen.getByTitle(/Swap baseline and target/i);
    fireEvent.click(swapButton);

    expect(baseInput.value).toBe("snap_beta");
    expect(targetInput.value).toBe("snap_alpha");

    const compareButton = screen.getByRole("button", { name: /Compare Snapshots/i });
    fireEvent.click(compareButton);

    expect(handleCompare).toHaveBeenCalledWith("snap_beta", "snap_alpha");
  });

  it("renders the parent ReportComparison workbench and navigates tabs", () => {
    render(<ReportComparison initialData={mockComparisonDocument} />);

    expect(screen.getByText(/Snapshot Comparison Workbench/i)).toBeDefined();
    expect(screen.getAllByText(/USDC/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Material delta observed/i)).toBeDefined();

    const factorsTab = screen.getByRole("tab", { name: /Factor Changes/i });
    fireEvent.click(factorsTab);
    expect(screen.getAllByText(/Freeze authority/i).length).toBeGreaterThanOrEqual(1);

    const sourcesTab = screen.getByRole("tab", { name: /Telemetry Sources/i });
    fireEvent.click(sourcesTab);
    expect(screen.getByText(/Critical Telemetry Warning/i)).toBeDefined();
  });
});
