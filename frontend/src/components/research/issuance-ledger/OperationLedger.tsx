import { stroopsToDecimal } from "@/server/research/issuance-ledger/decimalMath";
import type { LedgerOperation } from "@/server/research/issuance-ledger/schema";

export function OperationLedger({ operations }: { operations: LedgerOperation[] }) {
  return (
    <section data-testid="operation-ledger" className="overflow-x-auto rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Operation ledger</h2>
      <table className="mt-3 w-full text-left text-sm">
        <caption className="sr-only">Mint, burn, and neutral issuer operations with running supply</caption>
        <thead>
          <tr className="text-muted">
            <th scope="col">Ledger</th>
            <th scope="col">Kind</th>
            <th scope="col">Type</th>
            <th scope="col">Delta</th>
            <th scope="col">Running</th>
          </tr>
        </thead>
        <tbody>
          {operations.map((op) => (
            <tr key={op.id}>
              <td>{op.ledger}</td>
              <td>{op.kind}</td>
              <td>{op.type}</td>
              <td>{stroopsToDecimal(BigInt(op.amountStroops))}</td>
              <td>{stroopsToDecimal(BigInt(op.runningSupplyStroops))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {operations.length === 0 ? <p className="mt-2 text-sm text-muted">No issuer operations in this window.</p> : null}
    </section>
  );
}
