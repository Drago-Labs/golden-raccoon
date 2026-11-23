import type { TreasuryReport } from "@/server/research/treasury-flows";
export function BalanceChart({ balances }: { balances: TreasuryReport["balances"] }) {
  const text = balances.map((point) => `${point.asset} on ${point.chain} at ${point.time}: ${point.amount}`).join("; ") || "No checkpoints.";
  return (
    <figure>
      <figcaption className="text-sm">{text}</figcaption>
      <ul aria-hidden="true">{balances.map((point) => <li key={`${point.time}:${point.asset}`}>{point.amount}</li>)}</ul>
    </figure>
  );
}
