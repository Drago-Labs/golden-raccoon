import type { PairwiseCorrelation } from "@/server/research/holding-correlation";

export function CorrelationMatrix(props: { pairs: PairwiseCorrelation[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Pairwise correlation matrix (table view)</h3>
      {props.pairs.length === 0 ? (
        <p className="text-white/60">No eligible asset pairs to compare.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-white/60">
              <th className="py-1">Asset A</th>
              <th className="py-1">Asset B</th>
              <th className="py-1">Sample size</th>
              <th className="py-1">Pearson</th>
              <th className="py-1">Spearman</th>
            </tr>
          </thead>
          <tbody>
            {props.pairs.map((pair) => (
              <tr key={`${pair.assetA}-${pair.assetB}`} className="border-b border-white/5">
                <td className="py-1">{pair.assetA}</td>
                <td className="py-1">{pair.assetB}</td>
                <td className="py-1">{pair.sampleSize}</td>
                <td className="py-1">
                  {pair.insufficientOverlap || pair.pearson === null ? "Insufficient overlap" : pair.pearson.toFixed(4)}
                </td>
                <td className="py-1">
                  {pair.insufficientOverlap || pair.spearman === null ? "Insufficient overlap" : pair.spearman.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
