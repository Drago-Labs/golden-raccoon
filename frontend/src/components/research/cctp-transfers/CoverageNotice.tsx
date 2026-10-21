"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CctpTransferReport } from "@/server/research/cctp-transfers/schema";

const COVERAGE_TONES: Record<CctpTransferReport["coverage"]["state"], "success" | "warning" | "danger" | "neutral"> = {
  complete: "success",
  partial: "warning",
  empty: "neutral",
  unavailable: "danger",
};

export function CoverageNotice({ coverage }: { coverage: CctpTransferReport["coverage"] }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <StatusBadge tone={COVERAGE_TONES[coverage.state]}>{coverage.state}</StatusBadge>
      <span className="text-muted">{coverage.note}</span>
    </div>
  );
}
