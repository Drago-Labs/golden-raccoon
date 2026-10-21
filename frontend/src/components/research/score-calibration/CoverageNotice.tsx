"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CalibrationReport } from "@/server/research/score-calibration/schema";

const COVERAGE_TONES: Record<CalibrationReport["coverage"]["state"], "success" | "warning" | "danger" | "neutral"> = {
  complete: "success",
  partial: "warning",
  empty: "neutral",
  unavailable: "danger",
};

export function CoverageNotice({ coverage }: { coverage: CalibrationReport["coverage"] }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <StatusBadge tone={COVERAGE_TONES[coverage.state]}>{coverage.state}</StatusBadge>
      <span className="text-muted">{coverage.note}</span>
    </div>
  );
}
