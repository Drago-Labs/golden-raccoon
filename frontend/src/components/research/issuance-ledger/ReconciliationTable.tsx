import { stroopsToDecimal } from "@/server/research/issuance-ledger/decimalMath";
import type { IssuanceReport } from "@/server/research/issuance-ledger/schema";

export function ReconciliationTable({ report }: { report: IssuanceReport }) {
  return (
    <section data-testid="reconciliation-table" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">{report.reconciled ? "Reconciled at checkpoints" : "Unreconciled differences"}</h2>
      <table className="mt-3 w-full text-left">
        <caption className="sr-only">Checkpoint reconstructed supply versus network supply</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col">Ledger</th>
            <th scope="col">Reconstructed</th>
            <th scope="col">Network</th>
            <th scope="col">Delta</th>
          </tr>
        </thead>
        <tbody>
          {report.checkpoints.map((row) => (
            <tr key={row.ledger}>
              <td>{row.ledger}</td>
              <td>{stroopsToDecimal(BigInt(row.reconstructedStroops))}</td>
              <td>{row.networkStroops === null ? "unavailable" : stroopsToDecimal(BigInt(row.networkStroops))}</td>
              <td>{row.deltaStroops === null ? "unavailable" : `${row.deltaStroops} stroops`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {report.unreconciled.length > 0 ? (
        <div className="mt-4 space-y-3" data-testid="unreconciled-gaps">
          {report.unreconciled.map((gap) => (
            <div key={gap.ledger}>
              <p>
                Ledger {gap.ledger}: delta {gap.deltaStroops} stroops. Surrounding operations:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {gap.surrounding.map((op) => (
                  <li key={`${gap.ledger}-${op.id}`}>
                    {op.ledger} {op.kind} {op.type} {stroopsToDecimal(BigInt(op.amountStroops))}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
