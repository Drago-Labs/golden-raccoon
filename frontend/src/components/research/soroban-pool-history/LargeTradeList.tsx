import type { LargeTrade } from "@/server/research/soroban-pool-history/schema";

function explorerTxUrl(network: string, hash: string): string {
  const base = network === "stellar-pubnet" ? "https://stellar.expert/explorer/public" : "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${hash}`;
}

export function LargeTradeList({ trades, network }: { trades: LargeTrade[]; network: string }) {
  return (
    <section data-testid="large-trade-list" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Largest price-moving trades</h2>
      <p className="mt-1 text-muted">Ranked by absolute implied-price move. Each row links to its transaction.</p>
      {trades.length === 0 ? (
        <p className="mt-3 text-muted">No trades in this window.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {trades.map((trade) => (
            <li key={trade.eventId} className="flex flex-col gap-1 border-b border-white/5 pb-2 last:border-0">
              <span>
                Ledger {trade.ledger} · {trade.kind} · {trade.priceMoveBps} bps
              </span>
              <span className="text-muted">
                A={trade.amountA}, B={trade.amountB} · {trade.priceBefore} → {trade.priceAfter}
              </span>
              <a
                href={explorerTxUrl(network, trade.transactionHash)}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                Transaction {trade.transactionHash.slice(0, 12)}…
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
