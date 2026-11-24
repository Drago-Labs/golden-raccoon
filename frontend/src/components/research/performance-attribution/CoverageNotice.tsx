import type { AttributionReport } from "@/server/research/performance-attribution/schema";

/** What the attribution rests on, and which periods it could not attribute. */
export function CoverageNotice({ report }: { report: AttributionReport }) {
  const unavailable = report.periods.filter((period) => period.state === "unavailable");

  return (
    <aside className="space-y-3 rounded border p-4" aria-label="Evidence coverage">
      <h2 className="text-lg font-semibold">Evidence coverage</h2>
      <p className="text-sm">
        {report.totals.attributedPeriods} period(s) attributed, {report.totals.unavailablePeriods} without the
        observations needed.
      </p>
      {unavailable.length ? (
        <ul className="list-inside list-disc text-sm">
          {unavailable.map((period) => (
            <li key={period.label}>
              {period.label}: {period.notes.join(" ")}
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="list-inside list-disc text-sm">
        {report.coverage.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </aside>
  );
}
