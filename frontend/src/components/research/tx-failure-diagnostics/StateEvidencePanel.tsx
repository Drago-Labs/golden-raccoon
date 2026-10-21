import type { StateEvidence } from "@/server/research/tx-failure-diagnostics/schema";

export function StateEvidencePanel({ evidence }: { evidence: StateEvidence[] }) {
  if (evidence.length === 0) return null;

  return (
    <section data-testid="state-evidence" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Ledger state</h2>
      <ul className="flex flex-col gap-3">
        {evidence.map((entry) => (
          <li key={entry.account} className="text-sm">
            <p className="font-mono text-xs">{entry.account}</p>
            <p>Status: {entry.status}</p>
            {entry.sequence ? <p>Sequence: {entry.sequence}</p> : null}
            {entry.nativeBalance ? <p>Native balance: {entry.nativeBalance}</p> : null}
            <p className="text-muted">{entry.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
