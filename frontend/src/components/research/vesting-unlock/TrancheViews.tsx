"use client";

import { LiveRegion } from "@/components/a11y/LiveRegion";
import { StatusBadge } from "@/components/a11y/StatusBadge";
import { formatBaseUnits } from "@/server/research/vesting-unlock/unitMath";
import type { UnlockTranche, VestingUnlockReport } from "@/server/research/vesting-unlock/schema";
import { formatInTimeZone } from "@/server/research/vesting-unlock/time";

const STATE_TONES: Record<UnlockTranche["state"], "success" | "warning" | "danger" | "neutral"> = {
  released: "success",
  claimable: "warning",
  scheduled: "neutral",
  cancelled: "danger",
  unknown: "warning",
};

const SOURCE_LABELS: Record<UnlockTranche["sourceType"], string> = {
  onchain_enforced: "Onchain-enforced",
  published_only: "Published-only",
};

/**
 * Dated unlock table with distinct labels for published-only vs onchain-enforced.
 */
export function TrancheTable({
  tranches,
  displayTimeZone,
}: {
  tranches: UnlockTranche[];
  displayTimeZone: string;
}) {
  if (tranches.length === 0) {
    return (
      <p data-testid="tranche-empty" className="text-sm text-white/54">
        No dated unlocks were normalized from the supplied sources.
      </p>
    );
  }

  return (
    <div data-testid="tranche-table" className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="sr-only">Dated vesting unlock tranches</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-3 font-medium">
              Unlock
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Asset
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Amount
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Beneficiary
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              State
            </th>
            <th scope="col" className="py-2 font-medium">
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {tranches.map((tranche) => (
            <tr key={tranche.trancheId} className="border-t border-white/8 align-top">
              <td className="py-3 pr-3 text-xs text-white/70">
                <time dateTime={tranche.unlockAt}>{formatInTimeZone(tranche.unlockAt, displayTimeZone)}</time>
                {tranche.unlockLedger !== null ? (
                  <span className="mt-0.5 block text-white/42">ledger {tranche.unlockLedger}</span>
                ) : null}
              </td>
              <td className="py-3 pr-3 text-xs text-white/54">
                {tranche.asset.symbol}
                <span className="mt-0.5 block break-all font-mono text-[0.65rem] text-white/35">{tranche.asset.identity}</span>
              </td>
              <td className="py-3 pr-3 font-mono text-white/78 tabular-nums">
                {formatBaseUnits(tranche.amountBaseUnits, tranche.asset.decimals)}
              </td>
              <td className="py-3 pr-3 break-all font-mono text-xs text-white/54">
                {tranche.beneficiary ?? "unknown"}
              </td>
              <td className="py-3 pr-3">
                <StatusBadge tone={STATE_TONES[tranche.state]}>{tranche.state}</StatusBadge>
                {tranche.unknownReason ? <p className="mt-1 text-xs text-white/42">{tranche.unknownReason}</p> : null}
              </td>
              <td className="py-3 text-xs">
                <StatusBadge tone={tranche.sourceType === "onchain_enforced" ? "success" : "warning"}>
                  {SOURCE_LABELS[tranche.sourceType]}
                </StatusBadge>
                {tranche.evidenceUrl ? (
                  <a
                    className="mt-1 block underline underline-offset-2 text-white/54 hover:text-white"
                    href={tranche.evidenceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Evidence
                  </a>
                ) : (
                  <span className="mt-1 block text-white/35">{tranche.provenance}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UnlockTimeline({ report }: { report: VestingUnlockReport }) {
  if (report.timeline.length === 0) {
    return (
      <p data-testid="timeline-empty" className="text-sm text-white/54">
        No unlock timestamps were available for a timeline.
      </p>
    );
  }

  return (
    <div data-testid="unlock-timeline" className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <caption className="sr-only">Unlock amounts grouped by day</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Day
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Asset
            </th>
            <th scope="col" className="py-2 font-medium">
              Scheduled / released / claimable
            </th>
          </tr>
        </thead>
        <tbody>
          {report.timeline.map((bucket) =>
            bucket.byAsset.map((entry) => (
              <tr key={`${bucket.startsAt}-${entry.asset.identity}`} className="border-t border-white/8">
                <td className="py-3 pr-4 text-xs text-white/54">{bucket.startsAt.slice(0, 10)}</td>
                <td className="py-3 pr-4 text-xs text-white/54">
                  {entry.asset.symbol} · {entry.asset.network}
                </td>
                <td className="py-3 font-mono text-xs text-white/78 tabular-nums">
                  {formatBaseUnits(entry.scheduledBaseUnits, entry.asset.decimals)} /{" "}
                  {formatBaseUnits(entry.releasedBaseUnits, entry.asset.decimals)} /{" "}
                  {formatBaseUnits(entry.claimableBaseUnits, entry.asset.decimals)}
                  {entry.cancelledBaseUnits !== "0" ? (
                    <span className="mt-1 block text-white/42">
                      cancelled (not counted ahead): {formatBaseUnits(entry.cancelledBaseUnits, entry.asset.decimals)}
                    </span>
                  ) : null}
                </td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function CoveragePanel({ report }: { report: VestingUnlockReport }) {
  return (
    <section data-testid="vesting-coverage" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          tone={
            report.coverage.state === "complete"
              ? "success"
              : report.coverage.state === "unavailable"
                ? "danger"
                : "warning"
          }
        >
          {report.coverage.state}
        </StatusBadge>
        {report.coverage.staleObservation ? <StatusBadge tone="warning">stale observation</StatusBadge> : null}
      </div>
      <p className="text-sm text-white/70">{report.coverage.note}</p>
      <p className="text-xs text-white/42">
        {report.coverage.sourceCount} sources · {report.coverage.trancheCount} tranches ·{" "}
        {report.coverage.readsUsed}/{report.coverage.readBudget} reads · future counted{" "}
        <span className="font-mono">{report.coverage.countedFutureBaseUnits}</span> · cancelled not counted ahead{" "}
        <span className="font-mono">{report.coverage.cancelledFutureBaseUnits}</span>
      </p>
      {report.gaps.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-white/60">
          {report.gaps.map((gap) => (
            <li key={`${gap.kind}-${gap.sourceId}-${gap.detail}`}>
              <strong className="font-medium text-white/80">{gap.kind}</strong>: {gap.detail}
            </li>
          ))}
        </ul>
      ) : null}
      {report.warnings.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100/80">
          {report.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <LiveRegion message={`Coverage ${report.coverage.state}. ${report.coverage.note}`} />
    </section>
  );
}
