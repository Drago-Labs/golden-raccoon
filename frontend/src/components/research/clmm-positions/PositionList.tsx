import type { ExplainedPosition } from "@/server/research/clmm-positions/schema";

type PositionListProps = {
  positions: ExplainedPosition[];
  selectedTokenId: string | null;
  onSelect: (tokenId: string) => void;
};

export function PositionList({ positions, selectedTokenId, onSelect }: PositionListProps) {
  if (positions.length === 0) {
    return <p className="text-sm text-muted">No positions found for this address.</p>;
  }

  return (
    <ul aria-label="Concentrated liquidity positions" className="flex flex-col gap-2">
      {positions.map((position) => {
        const selected = position.tokenId === selectedTokenId;
        return (
          <li key={position.tokenId}>
            <button
              type="button"
              onClick={() => onSelect(position.tokenId)}
              aria-pressed={selected}
              className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition ${
                selected ? "border-[#d9a441]/50 bg-[#d9a441]/10" : "border-white/10 bg-white/4"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  #{position.tokenId} · {position.token0Symbol}/{position.token1Symbol}
                </span>
                <span className="text-xs uppercase tracking-wide text-subtle">
                  {position.closed ? "closed" : position.range.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-muted">
                {position.amounts.amount0} {position.token0Symbol} · {position.amounts.amount1}{" "}
                {position.token1Symbol}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
