import type { Comparison } from "@/server/research/treasury-flows";
export function ReportedVsObserved({ comparisons }: { comparisons: Comparison[] }) {
  return (
    <section>
      <h2 className="font-medium">Reported versus observed</h2>
      <ul>{comparisons.map((row) => <li key={`${row.asset}:${row.chain}`}>Reported {row.reported}, observed {row.observed ?? "none"}, source {row.source}. {row.matches ? "Match." : "Mismatch."}</li>)}</ul>
    </section>
  );
}
