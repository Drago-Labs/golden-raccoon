import type { BalanceMovement } from "@/server/research/balance-reconciliation/schema";
import { stroopsToDecimal } from "@/server/research/balance-reconciliation/runningBalance";

export function BalanceTimeline({ timeline }: { timeline: BalanceMovement[] }) {
  return (
    <section data-testid="balance-timeline" className="overflow-x-auto rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Balance timeline</h2>
      <ol className="mt-3 flex flex-col gap-2 text-sm">
        {timeline.map((movement) => (
          <li key={`${movement.ledger}-${movement.category}-${movement.asset}-${movement.stroops}`}>
            Ledger {movement.ledger}: {movement.category} {movement.asset} {stroopsToDecimal(BigInt(movement.stroops))} (running {stroopsToDecimal(BigInt(movement.runningStroops))})
          </li>
        ))}
      </ol>
    </section>
  );
}
