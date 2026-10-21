import type { OperationDiagnosis } from "@/server/research/tx-failure-diagnostics/schema";

const OUTCOME_LABEL = {
  would_succeed_alone: "Would have succeeded alone",
  aborted_transaction: "Aborted the transaction",
  not_attempted: "Not attempted",
} as const;

export function OperationDiagnosisList({ operations }: { operations: OperationDiagnosis[] }) {
  if (operations.length === 0) return null;

  return (
    <section data-testid="operation-diagnosis" className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Operations</h2>
      <ol className="flex flex-col gap-3">
        {operations.map((operation) => (
          <li key={operation.index} className="rounded-xl border border-white/10 p-3 text-sm">
            <p className="font-medium">
              {operation.index + 1}. {operation.type} — {OUTCOME_LABEL[operation.outcome]}
            </p>
            {operation.resultCode ? <p className="font-mono text-xs">{operation.resultCode}</p> : null}
            <p className="text-muted">{operation.explanation}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
