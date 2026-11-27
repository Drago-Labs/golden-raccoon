import { rangeStatusSummary } from "@/server/research/clmm-positions/rangeStatus";
import type { ExplainedPosition } from "@/server/research/clmm-positions/schema";

type RangeVisualProps = {
  position: ExplainedPosition;
};

export function RangeVisual({ position }: RangeVisualProps) {
  const { range } = position;
  const span = Math.max(1, range.tickUpper - range.tickLower);
  const clamped = Math.min(range.tickUpper, Math.max(range.tickLower, range.currentTick));
  const marker = ((clamped - range.tickLower) / span) * 100;
  const summary = rangeStatusSummary(range, position.liquidity);

  return (
    <section aria-label="Price range visual" className="rounded-2xl border border-white/10 p-4">
      <h2 className="text-lg font-semibold">Price range</h2>
      <p className="mt-1 text-sm text-muted" data-testid="range-summary">
        {summary}
      </p>
      <div
        role="img"
        aria-label={summary}
        className="relative mt-4 h-3 rounded-full bg-white/10"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#d9a441]/45"
          style={{ width: "100%" }}
        />
        <div
          className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-white"
          style={{ left: `calc(${marker}% - 2px)` }}
          title={`Current tick ${range.currentTick}`}
        />
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-subtle">Lower</dt>
          <dd>
            tick {range.tickLower} · price {range.priceLower}
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Current</dt>
          <dd>
            tick {range.currentTick} · price {range.currentPrice}
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Upper</dt>
          <dd>
            tick {range.tickUpper} · price {range.priceUpper}
          </dd>
        </div>
      </dl>
      {!range.inRange && !position.closed && range.distanceToNearestBoundPercent !== null ? (
        <p className="mt-3 text-sm text-[#f2c86d]">
          Distance to nearest bound ({range.nearestBound}): {range.distanceToNearestBoundPercent}%
        </p>
      ) : null}
    </section>
  );
}
