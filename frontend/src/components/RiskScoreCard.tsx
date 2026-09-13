"use client";

import { CircleHelp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { RiskReport, TokenHolding } from "@/server/types";
import { getPortfolioRiskSignals } from "@/server/portfolio/riskScoring";
import { sessionKeyFor, stageExplanationReport } from "@/components/research/risk-explanations/ExplanationWorkbench";

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function arcPath(startAngle: number, endAngle: number) {
  const start = polarToCartesian(100, 100, 74, endAngle);
  const end = polarToCartesian(100, 100, 74, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return `M ${start.x} ${start.y} A 74 74 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export function RiskScoreCard({
  score,
  holdings = [],
  report,
  account,
  network,
}: {
  score: number;
  holdings?: TokenHolding[];
  /** Optional report to explain. When absent the entry link is not rendered. */
  report?: RiskReport;
  account?: string | null;
  network?: string | null;
}) {
  const router = useRouter();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const headingId = useId();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const boundedScore = Math.min(100, Math.max(0, score));
  const level = boundedScore >= 71 ? "High" : boundedScore >= 41 ? "Medium" : "Low";
  const markerAngle = -90 + boundedScore * 1.8;
  const marker = polarToCartesian(100, 100, 74, markerAngle);
  const markerStem = polarToCartesian(100, 100, 58, markerAngle);
  const markerColor =
    level === "High" ? "var(--color-risk-high)" : level === "Medium" ? "var(--color-risk-medium)" : "var(--color-risk-low)";
  const levelToneClass = level === "High" ? "risk-tone-high" : level === "Medium" ? "risk-tone-medium" : "risk-tone-low";
  const signals = getPortfolioRiskSignals(holdings);
  const categories = [
    { label: "Concentration", score: signals.concentrationRisk, weight: 30 },
    { label: "Asset quality", score: signals.assetQualityRisk, weight: 20 },
    { label: "Liquidity", score: signals.liquidityExitRisk, weight: 15 },
    { label: "Stable reserve", score: signals.stableReserveRisk, weight: 10 },
    { label: "Volatility", score: signals.volatilityRisk, weight: 10 },
    { label: "Correlation", score: signals.correlationRisk, weight: 10 },
    { label: "Network execution", score: signals.chainExecutionRisk, weight: 5 },
  ];

  useEffect(() => {
    if (showBreakdown) {
      closeButtonRef.current?.focus();
      return;
    }
  }, [showBreakdown]);

  function closeBreakdown() {
    setShowBreakdown(false);
    toggleButtonRef.current?.focus();
  }

  /**
   * Hands the selected report to the explanation workbench in memory. The
   * report is keyed to the current wallet session, so a stale token from
   * another account or network is refused on arrival.
   */
  function openExplanationWorkbench() {
    if (!report) return;
    const sessionKey = sessionKeyFor(account, network);
    const token = stageExplanationReport(sessionKey, report);
    const query = new URLSearchParams({ handoff: token });
    if (account) query.set("account", account);
    if (network) query.set("network", network);
    router.push(`/insights/risk-explanations?${query.toString()}`);
  }

  return (
    <section className="glass-panel relative flex h-full flex-col rounded-[28px] p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            Portfolio risk
            {holdings.length > 0 ? (
              <button
                ref={toggleButtonRef}
                type="button"
                onClick={() => setShowBreakdown((visible) => !visible)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-subtle transition hover:bg-[var(--color-nav-hover-bg)] hover:text-[var(--color-fg)]"
                aria-label="Show risk score breakdown"
                aria-expanded={showBreakdown}
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="mt-1 text-4xl font-semibold">{boundedScore}/100</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${levelToneClass}`}>
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: markerColor }} />
          <span aria-hidden="true">{level === "High" ? "▲" : level === "Medium" ? "●" : "▼"}</span>
          Risk level: {level}
        </span>
      </div>

      {showBreakdown && holdings.length > 0 ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={headingId}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeBreakdown();
          }}
          className="absolute inset-x-5 top-24 z-10 rounded-lg border border-[var(--color-border-strong)] bg-panel p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-3">
            <div id={headingId} className="text-sm font-semibold">Why {boundedScore}/100?</div>
            <button ref={closeButtonRef} type="button" onClick={closeBreakdown} className="touch-target rounded-full text-subtle hover:bg-[var(--color-nav-hover-bg)] hover:text-[var(--color-fg)]" aria-label="Close risk breakdown">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 space-y-2.5">
            {categories.map((category) => (
              <div key={category.label} className="grid grid-cols-[1fr_5rem] items-center gap-3 text-xs">
                <div>
                  <div className="flex justify-between gap-3 text-muted">
                    <span>{category.label}</span>
                    <span>{category.weight}% weight</span>
                  </div>
                  <div
                    role="meter"
                    aria-label={`${category.label} risk`}
                    aria-valuenow={category.score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-gauge-track)]"
                  >
                    <div className="h-full rounded-full bg-brand" style={{ width: `${category.score}%` }} />
                  </div>
                </div>
                <div className="text-right font-semibold text-foreground">{category.score}/100</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-subtle">Overall risk uses the category weights above and portfolio safety floors.</p>
        </div>
      ) : null}

      <div className="flex flex-1 items-center justify-center">
        <svg
          viewBox="0 0 200 128"
          className="h-40 w-full max-w-xs overflow-visible"
          role="img"
          aria-label={`Portfolio risk score ${boundedScore} out of 100, ${level} risk`}
        >
          <defs>
            <linearGradient id="riskGaugeGradient" x1="24" x2="176" y1="100" y2="100" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="var(--color-risk-low)" />
              <stop offset="50%" stopColor="var(--color-risk-medium)" />
              <stop offset="100%" stopColor="var(--color-risk-high)" />
            </linearGradient>
          </defs>
          <path d={arcPath(-90, 90)} fill="none" stroke="var(--color-gauge-track)" strokeWidth="16" strokeLinecap="round" />
          <path d={arcPath(-90, 90)} fill="none" stroke="url(#riskGaugeGradient)" strokeWidth="16" strokeLinecap="round" />
          <line x1={markerStem.x} y1={markerStem.y} x2={marker.x} y2={marker.y} stroke="var(--color-gauge-marker-stem)" strokeWidth="4" strokeLinecap="round" />
          <circle cx={marker.x} cy={marker.y} r="9" fill="var(--color-gauge-marker-ring)" stroke="var(--color-gauge-marker-stem)" strokeWidth="3" />
          <circle cx={marker.x} cy={marker.y} r="4" fill={markerColor} />
          <text x="100" y="78" textAnchor="middle" fill="var(--color-fg)" className="text-4xl font-semibold">
            {boundedScore}
          </text>
          <text x="100" y="106" textAnchor="middle" fill="var(--color-fg-muted)" className="text-sm">
            {level} risk
          </text>
          <text x="26" y="124" textAnchor="middle" fill="var(--color-fg-subtle)" className="text-xs">
            ▼ Low
          </text>
          <text x="100" y="124" textAnchor="middle" fill="var(--color-fg-subtle)" className="text-xs">
            ● Medium
          </text>
          <text x="174" y="124" textAnchor="middle" fill="var(--color-fg-subtle)" className="text-xs">
            ▲ High
          </text>
        </svg>
      </div>

      {report ? (
        <button
          type="button"
          onClick={openExplanationWorkbench}
          className="mt-4 self-start rounded-full border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-muted transition hover:text-[var(--color-fg)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
        >
          Explain this score
          <span className="sr-only"> — open the evidence-linked explanation workbench for report {report.id}</span>
        </button>
      ) : null}
    </section>
  );
}
