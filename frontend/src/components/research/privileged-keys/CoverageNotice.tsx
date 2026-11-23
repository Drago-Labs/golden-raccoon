import type { Coverage } from "@/server/research/privileged-keys";

export function CoverageNotice({ coverage }: { coverage: Coverage }) {
  return (
    <section role="status" className="text-sm">
      <h2 className="font-medium">Coverage</h2>
      <p>{coverage.contractsRead} contracts on {coverage.chains.join(", ") || "no chain"}.</p>
      <ul>
        {coverage.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
