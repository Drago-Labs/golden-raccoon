"use client";

import { AlertTriangle, Check } from "lucide-react";
import type { RiskLevel } from "@/server/types";

const severityTone: Record<RiskLevel, { wrapper: string; icon: string }> = {
  low: { wrapper: "border-emerald-300/25 bg-emerald-300/8", icon: "text-emerald-200" },
  medium: { wrapper: "border-[#d9a441]/30 bg-[#d9a441]/8", icon: "text-[#f2c86d]" },
  high: { wrapper: "border-orange-300/25 bg-orange-300/8", icon: "text-orange-200" },
  critical: { wrapper: "border-red-300/30 bg-red-400/8", icon: "text-red-200" },
};

type AlertCardProps = {
  title: string;
  detail: string;
  severity: RiskLevel;
  sourceLabel: string;
};

export function AlertCard({ title, detail, severity, sourceLabel }: AlertCardProps) {
  const tone = severityTone[severity];

  return (
    <section className={`rounded-[28px] border p-6 ${tone.wrapper}`}>
      <div className="flex items-start gap-4">
        <div className={`rounded-full bg-white/8 p-3 ${tone.icon}`}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            <span className="text-xs text-white/62">{sourceLabel}</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/78">{detail}</p>
        </div>
      </div>
    </section>
  );
}
