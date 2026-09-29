"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { BudgetRow, PreflightBlocker, PreflightReport } from "@/server/research/execution-preflight/schema";

export function PreflightTable({ rows }: { rows: BudgetRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-subtle">No budget rows.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Preflight budget. Exact integers are base units; estimates are labelled. This view never signs or sends.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Line</th>
            <th scope="col" className="py-2 pr-3">Amount</th>
            <th scope="col" className="py-2 pr-3">Kind</th>
            <th scope="col" className="py-2 pr-3">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowId} data-testid={`budget-row-${row.rowId}`}>
              <th scope="row" className="py-3 pr-3 align-top font-medium">
                {row.label}
                <p className="mt-1 text-xs font-normal text-subtle">{row.note}</p>
              </th>
              <td className="py-3 pr-3 align-top font-mono text-xs">
                {row.amount ?? "—"} {row.unit}
              </td>
              <td className="py-3 pr-3 align-top text-xs">{row.kind}</td>
              <td className="py-3 pr-3 align-top text-xs text-subtle">{row.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BlockerList({ blockers }: { blockers: PreflightBlocker[] }) {
  if (blockers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle" data-testid="blockers">
        No blockers.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="blockers">
      {blockers.map((blocker) => (
        <li key={`${blocker.code}-${blocker.detail}`} className="rounded-xl border border-white/10 px-4 py-3">
          <StatusBadge tone="danger">{blocker.code.replaceAll("_", " ")}</StatusBadge>
          <p className="mt-2 text-xs text-subtle">{blocker.detail}</p>
        </li>
      ))}
    </ul>
  );
}

export function PreflightSummary({ report }: { report: PreflightReport }) {
  return (
    <section aria-labelledby="preflight-summary-heading" className="rounded-xl border border-white/10 p-4">
      <h2 id="preflight-summary-heading" className="text-sm font-semibold">
        {report.chainFamily.toUpperCase()} · {report.network}
      </h2>
      <p className="mt-1 font-mono text-xs text-subtle">plan {report.planHash}</p>
      <p className="mt-2 text-xs text-subtle" data-testid="coverage-note">
        Coverage: {report.coverage.state}. Safe to present as complete:{" "}
        {report.coverage.safeToPresentAsComplete ? "yes" : "no"}. {report.coverage.note}
      </p>
      <p className="mt-2 text-xs text-subtle" data-testid="never-signs">
        Never signs or sends: {report.neverSignsOrSends ? "yes" : "no"}
      </p>
      <p className="mt-2 text-xs text-subtle" data-testid="totals">
        Worst-case spend: {report.totals.worstCaseSpend ?? "—"} {report.totals.worstCaseSpendUnit}. Likely post-tx
        balance: {report.totals.postTxBalance ?? "—"} {report.totals.postTxBalanceUnit}.
      </p>
    </section>
  );
}
