import type { ConvertedPosition } from "@/server/research/blend-positions";

export function PositionTable(props: { positions: ConvertedPosition[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Reserve positions</h3>
      {props.positions.length === 0 ? (
        <p className="text-white/60">No active supply or borrow positions in this pool.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-white/60">
              <th className="py-1">Asset</th>
              <th className="py-1">Underlying supply</th>
              <th className="py-1">Underlying borrow</th>
              <th className="py-1">CF / LF (bps)</th>
              <th className="py-1">Oracle price</th>
              <th className="py-1">Effective collateral</th>
              <th className="py-1">Effective liability</th>
            </tr>
          </thead>
          <tbody>
            {props.positions.map((pos) => (
              <tr key={pos.assetId} className="border-b border-white/5">
                <td className="py-1 font-medium text-white">{pos.symbol}</td>
                <td className="py-1 font-mono">{pos.underlyingSupplyFormatted}</td>
                <td className="py-1 font-mono">{pos.underlyingBorrowFormatted}</td>
                <td className="py-1">
                  {pos.collateralFactorBps} / {pos.liabilityFactorBps}
                </td>
                <td className="py-1">{pos.priceUsd !== null ? `$${pos.priceUsd.toFixed(4)}` : "Unavailable"}</td>
                <td className="py-1">
                  {pos.effectiveCollateralUsd !== null ? `$${pos.effectiveCollateralUsd.toFixed(2)}` : "Unavailable"}
                </td>
                <td className="py-1">
                  {pos.effectiveLiabilityUsd !== null ? `$${pos.effectiveLiabilityUsd.toFixed(2)}` : "Unavailable"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
