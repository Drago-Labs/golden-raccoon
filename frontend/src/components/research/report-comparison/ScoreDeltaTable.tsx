"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { DeltaDirection, ScoreDelta, VerdictDelta } from "@/server/research/report-comparison/schema";

const directionLabel: Record<DeltaDirection, string> = {
  increase: "Increased",
  decrease: "Decreased",
  unchanged: "Unchanged",
  unknown_to_known: "Became observable",
  known_to_unknown: "Stopped being observable",
  unknown_both: "Never observable",
};

const directionTone: Record<DeltaDirection, "success" | "warning" | "danger" | "neutral"> = {
  increase: "danger",
  decrease: "success",
  unchanged: "neutral",
  unknown_to_known: "warning",
  known_to_unknown: "warning",
  unknown_both: "neutral",
};

function formatValue(value: number | null): string {
  return value === null ? "Not observable" : String(value);
}

/**
 * Side-by-side numeric comparison.
 *
 * Gaining or losing observability gets its own label and tone, so it can never
 * be read as a numeric move in either direction.
 */
export function ScoreDeltaTable({
  scores,
  verdict,
  leftLabel,
  rightLabel,
}: {
  scores: ScoreDelta[];
  verdict: VerdictDelta;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <caption className="sr-only">Score and verdict differences between the two observations</caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Measure</th>
            <th scope="col" className="py-2 pr-3">{leftLabel}</th>
            <th scope="col" className="py-2 pr-3">{rightLabel}</th>
            <th scope="col" className="py-2 pr-3">Change</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((delta) => (
            <tr key={delta.field} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 font-medium">
                {delta.field === "buyRisk" ? "Buy risk" : "Confidence"}
              </th>
              <td className="py-2 pr-3 tabular-nums">{formatValue(delta.left)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatValue(delta.right)}</td>
              <td className="py-2 pr-3 text-xs">
                <StatusBadge tone={directionTone[delta.direction]}>{directionLabel[delta.direction]}</StatusBadge>
                <span className="mt-1 block text-subtle">{delta.note}</span>
              </td>
            </tr>
          ))}
          <tr className="align-top">
            <th scope="row" className="py-2 pr-3 font-medium">Verdict</th>
            <td className="py-2 pr-3">{verdict.left ?? "Not observable"}</td>
            <td className="py-2 pr-3">{verdict.right ?? "Not observable"}</td>
            <td className="py-2 pr-3 text-xs">
              <StatusBadge tone={verdict.changed ? "warning" : "neutral"}>
                {verdict.changed ? "Changed" : "Unchanged"}
              </StatusBadge>
              <span className="mt-1 block text-subtle">{verdict.note}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
