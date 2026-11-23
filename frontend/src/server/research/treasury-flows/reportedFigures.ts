import { latestBalance } from "./balanceHistory";
import type { BalancePoint, Comparison, ReportedFigure } from "./schema";
export function compareReported(figures: ReportedFigure[], balances: BalancePoint[]): Comparison[] {
  return figures.map((figure) => {
    const observed = latestBalance(balances, figure.asset, figure.chain);
    return {
      asset: figure.asset,
      chain: figure.chain,
      reported: figure.reported,
      observed,
      source: figure.source,
      matches: observed !== null && observed === figure.reported,
    };
  });
}
