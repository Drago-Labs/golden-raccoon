"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { VenueAnalysis } from "@/server/research/liquidity-depth/schema";

const modelLabel = {
  orderbook: "Order book",
  constant_product: "Constant product",
  unsupported_model: "Model not implemented",
} as const;

/**
 * Venue picker. Each option states its model, because an order-book figure and
 * a pool figure mean different things and must never be compared as if they did
 * not.
 */
export function VenueSelector({
  venues,
  selectedVenueId,
  onSelect,
}: {
  venues: VenueAnalysis[];
  selectedVenueId: string | null;
  onSelect: (venueId: string) => void;
}) {
  if (venues.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No venue snapshot was supplied.
      </p>
    );
  }

  return (
    <div role="radiogroup" aria-label="Venue" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {venues.map((analysis) => {
        const selected = analysis.venue.venueId === selectedVenueId;

        return (
          <button
            key={analysis.venue.venueId}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(analysis.venue.venueId)}
            className={`rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] ${
              selected ? "border-[var(--color-brand)]" : "border-white/15 hover:border-white/30"
            }`}
          >
            <span className="block text-sm font-medium">{analysis.venue.label}</span>
            <span className="mt-1 block text-xs text-subtle">
              {modelLabel[analysis.venue.model]} · {analysis.venue.feeBps} bps fee
            </span>
            <span className="mt-1 block text-xs text-subtle">
              {analysis.venue.base.symbol}/{analysis.venue.quote.symbol} on {analysis.venue.base.chainId}
            </span>
            <span className="mt-2 block">
              <StatusBadge tone={analysis.state === "complete" ? "success" : analysis.state === "partial" ? "warning" : "danger"}>
                {analysis.state}
              </StatusBadge>
            </span>
          </button>
        );
      })}
    </div>
  );
}
