"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ClaimCoverage } from "@/server/research/evidence-coverage/schema";

const stateLabel: Record<ClaimCoverage["state"], string> = {
  corroborated: "Corroborated",
  single_family: "One source family",
  incomparable: "Not comparable",
  contradicted: "Contradicted",
  uncovered: "Uncovered",
};

const stateTone: Record<ClaimCoverage["state"], "success" | "warning" | "danger" | "neutral"> = {
  corroborated: "success",
  single_family: "warning",
  incomparable: "warning",
  contradicted: "danger",
  uncovered: "danger",
};

/**
 * Coverage per claim.
 *
 * The column that matters is independent families, not observation count: the
 * table shows both side by side so a claim with six observations from one
 * vendor cannot read as six confirmations.
 */
export function ClaimCoverageTable({
  claims,
  selectedClaimId,
  onSelect,
}: {
  claims: ClaimCoverage[];
  selectedClaimId: string | null;
  onSelect: (claimId: string) => void;
}) {
  if (claims.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        This report carries no claims, so there is no coverage to assess.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Coverage per claim. Independent families, not observation count, decide whether a claim is corroborated.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Claim</th>
            <th scope="col" className="py-2 pr-3">Independent families</th>
            <th scope="col" className="py-2 pr-3">Observations</th>
            <th scope="col" className="py-2 pr-3">Freshness</th>
            <th scope="col" className="py-2 pr-3">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr
              key={claim.claimId}
              aria-selected={claim.claimId === selectedClaimId}
              className={`border-b border-white/5 align-top ${claim.claimId === selectedClaimId ? "bg-white/5" : ""}`}
            >
              <th scope="row" className="py-2 pr-3 font-medium">
                <button
                  type="button"
                  onClick={() => onSelect(claim.claimId)}
                  className="text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
                >
                  {claim.label}
                </button>
                <span className="mt-1 block break-all font-mono text-[11px] font-normal text-subtle">
                  {claim.subjectIdentityKey}
                </span>
              </th>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {claim.independentFamilyCount}
                {claim.redundantObservationCount > 0 ? (
                  <span className="block text-subtle">
                    {claim.redundantObservationCount} repeat{claim.redundantObservationCount === 1 ? "" : "s"} a counted family
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {claim.observationIds.length}
                <span className="block text-subtle">
                  {claim.connectedCount} connected · {claim.unavailableCount} unavailable
                </span>
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {claim.freshCount} fresh · {claim.staleCount} stale
                <span className="block text-subtle">{claim.unknownFreshnessCount} unknown age</span>
              </td>
              <td className="py-2 pr-3 text-xs">
                <StatusBadge tone={stateTone[claim.state]}>{stateLabel[claim.state]}</StatusBadge>
                <span className="mt-1 block text-subtle">{claim.note}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
