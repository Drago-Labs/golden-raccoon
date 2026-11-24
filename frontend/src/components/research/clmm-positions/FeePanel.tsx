import type { ExplainedPosition, PositionTotals } from "@/server/research/clmm-positions/schema";

type FeePanelProps = {
  position?: ExplainedPosition;
  totals: PositionTotals;
};

export function FeePanel({ position, totals }: FeePanelProps) {
  return (
    <section aria-label="Uncollected fees" className="rounded-2xl border border-white/10 p-4">
      <h2 className="text-lg font-semibold">Uncollected fees</h2>
      {position ? (
        <p className="mt-2 text-sm text-muted">
          Position #{position.tokenId}: {position.fees.token0} {position.token0Symbol} · {position.fees.token1}{" "}
          {position.token1Symbol}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">Select a position to inspect per-NFT fees.</p>
      )}
      <p className="mt-3 text-sm">
        Open-position fee totals (closed excluded): {totals.fees0} token0 · {totals.fees1} token1
      </p>
    </section>
  );
}
