import type { PeriodAttribution } from "@/server/research/performance-attribution/schema";

/** Per-period attribution with its asset and chain breakdown. */
export function AttributionTable({ periods }: { periods: PeriodAttribution[] }) {
  return (
    <section className="space-y-4" aria-label="Attribution by period">
      <h2 className="text-lg font-semibold">Attribution by period</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left">
            Observed change, external flows and market movement per period. Flows are subtracted before anything is
            attributed to the market.
          </caption>
          <thead>
            <tr>
              {["Period", "Coverage", "Start value", "End value", "Change", "External flows", "Market", "Price effect", "Residual"].map(
                (label) => (
                  <th key={label} scope="col" className="p-2">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.label}>
                <th scope="row" className="p-2">
                  {period.label}
                </th>
                <td className="p-2">
                  {period.state === "complete" ? "Complete" : period.state === "partial" ? "Partial" : "No data"}
                  {period.notes.length ? <span className="block text-xs">{period.notes.join(" ")}</span> : null}
                </td>
                {[
                  period.startValueUsd,
                  period.endValueUsd,
                  period.changeUsd,
                  period.externalFlowUsd,
                  period.marketUsd,
                  period.priceEffectUsd,
                  period.residualUsd,
                ].map((value, index) => (
                  <td key={index} className="p-2 tabular-nums">
                    {value ?? "Unavailable"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {periods
        .filter((period) => period.assets.length)
        .map((period) => (
          <div key={`${period.label}-assets`} className="space-y-2">
            <h3 className="font-semibold">{period.label}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="pb-2 text-left">Contribution by asset, {period.label}</caption>
                <thead>
                  <tr>
                    {["Asset", "Chain", "Change", "External flows", "Market", "Price effect", "Residual", "Share of market (bps)"].map(
                      (label) => (
                        <th key={label} scope="col" className="p-2">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {period.assets.map((asset) => (
                    <tr key={asset.key}>
                      <th scope="row" className="max-w-56 break-all p-2">
                        {asset.symbol}
                        <span className="block text-xs font-normal">{asset.key}</span>
                      </th>
                      <td className="p-2">{asset.chain}</td>
                      {[
                        asset.changeUsd,
                        asset.externalFlowUsd,
                        asset.marketUsd,
                        asset.priceEffectUsd,
                        asset.residualUsd,
                        asset.marketShareBps,
                      ].map((value, index) => (
                        <td key={index} className="p-2 tabular-nums">
                          {value ?? "Unavailable"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="pb-2 text-left">Contribution by chain, {period.label}</caption>
                <thead>
                  <tr>
                    {["Chain", "Coverage", "External flows", "Market", "Price effect", "Residual"].map((label) => (
                      <th key={label} scope="col" className="p-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {period.chains.map((chain) => (
                    <tr key={chain.chain}>
                      <th scope="row" className="p-2">
                        {chain.chain}
                      </th>
                      <td className="p-2">{chain.state === "complete" ? "Complete" : "Partial"}</td>
                      {[chain.externalFlowUsd, chain.marketUsd, chain.priceEffectUsd, chain.residualUsd].map(
                        (value, index) => (
                          <td key={index} className="p-2 tabular-nums">
                            {value ?? "Unavailable"}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
    </section>
  );
}
