"use client";

import type { ComparisonSubject, ScoreDelta } from "@/server/research/report-comparison/schema";

type Props = {
  scoreDelta: ScoreDelta;
  subject: ComparisonSubject;
};

function formatElapsed(seconds: number): string {
  if (seconds <= 0) return "Concurrent / same observation window";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function formatVerdict(verdict: string): string {
  return verdict.replace(/_/g, " ").toUpperCase();
}

/**
 * Renders a side-by-side metric comparison table detailing buy risk scores,
 * model confidence, verdict shifts, observation timestamps, and missing data transitions.
 */
export function ScoreDeltaTable({ scoreDelta, subject }: Props) {
  const { buyRisk, confidence, verdict, missingData } = scoreDelta;

  const buyRiskColor =
    buyRisk.delta > 0
      ? "text-red-400 bg-red-400/10 border-red-500/20"
      : buyRisk.delta < 0
        ? "text-emerald-400 bg-emerald-400/10 border-emerald-500/20"
        : "text-white/60 bg-white/5 border-white/10";

  const confidenceColor =
    confidence.delta > 0
      ? "text-emerald-400 bg-emerald-400/10 border-emerald-500/20"
      : confidence.delta < 0
        ? "text-amber-400 bg-amber-400/10 border-amber-500/20"
        : "text-white/60 bg-white/5 border-white/10";

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d131f]/80">
        <table className="w-full text-left text-sm" aria-label="Score comparisons">
          <thead className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-white/40">
            <tr>
              <th scope="col" className="px-6 py-4">Metric</th>
              <th scope="col" className="px-6 py-4">Baseline ({subject.baseObservation.id ? subject.baseObservation.id.slice(0, 12) : "Base"})</th>
              <th scope="col" className="px-6 py-4">Target ({subject.targetObservation.id ? subject.targetObservation.id.slice(0, 12) : "Target"})</th>
              <th scope="col" className="px-6 py-4 text-right">Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono">
            <tr>
              <td className="px-6 py-4 font-sans font-medium text-white/90">
                Buy Risk Score
                <p className="font-sans text-xs font-normal text-white/40">Scale 0-100 (lower risk is safer)</p>
              </td>
              <td className="px-6 py-4 text-white/70">{buyRisk.base}</td>
              <td className="px-6 py-4 font-semibold text-white/90">{buyRisk.target}</td>
              <td className="px-6 py-4 text-right">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${buyRiskColor}`}>
                  {buyRisk.delta > 0 ? `+${buyRisk.delta}` : buyRisk.delta} points ({buyRisk.direction})
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-sans font-medium text-white/90">
                Model Confidence
                <p className="font-sans text-xs font-normal text-white/40">Data availability & evidence depth (0-1)</p>
              </td>
              <td className="px-6 py-4 text-white/70">{(confidence.base * 100).toFixed(1)}%</td>
              <td className="px-6 py-4 font-semibold text-white/90">{(confidence.target * 100).toFixed(1)}%</td>
              <td className="px-6 py-4 text-right">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${confidenceColor}`}>
                  {confidence.delta > 0 ? `+${(confidence.delta * 100).toFixed(1)}%` : `${(confidence.delta * 100).toFixed(1)}%`}
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-sans font-medium text-white/90">Action Verdict</td>
              <td className="px-6 py-4 text-white/70">{formatVerdict(verdict.base)}</td>
              <td className="px-6 py-4 font-semibold text-white/90">{formatVerdict(verdict.target)}</td>
              <td className="px-6 py-4 text-right font-sans">
                {verdict.changed ? (
                  <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                    Shifted Verdict
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-white/60">
                    Unchanged
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-sans font-medium text-white/90">Observation Recorded</td>
              <td className="px-6 py-4 text-xs text-white/70">{new Date(subject.baseObservation.generatedAt).toLocaleString()}</td>
              <td className="px-6 py-4 text-xs font-semibold text-white/90">{new Date(subject.targetObservation.generatedAt).toLocaleString()}</td>
              <td className="px-6 py-4 text-right font-sans text-xs text-white/60">
                {formatElapsed(subject.timeElapsedSeconds)} elapsed
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0d131f]/80 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/70">
          Missing Data & Unknown Transition Boundaries
        </h3>
        <p className="mt-1 text-xs text-white/40">
          Unknown-to-known and known-to-unknown values represent telemetry boundary changes and are maintained strictly distinct from numeric score shifts.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <span className="text-xs font-semibold text-emerald-400">
              Resolved Data (Unknown → Known): {missingData.unknownToKnown.length}
            </span>
            {missingData.unknownToKnown.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-white/70">
                {missingData.unknownToKnown.map((field) => (
                  <li key={field} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span>{field}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-white/40">No missing fields were resolved in the target observation.</p>
            )}
          </div>

          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <span className="text-xs font-semibold text-amber-400">
              Omitted Data (Known → Unknown): {missingData.knownToUnknown.length}
            </span>
            {missingData.knownToUnknown.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-white/70">
                {missingData.knownToUnknown.map((field) => (
                  <li key={field} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span>{field}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-white/40">No previously known fields became missing in the target observation.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
