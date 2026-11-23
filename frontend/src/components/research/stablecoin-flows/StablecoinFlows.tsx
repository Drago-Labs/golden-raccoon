"use client";

import { useState } from "react";
import { AssetSelector } from "./AssetSelector";
import { CoverageNotice } from "./CoverageNotice";
import { EventList } from "./EventList";
import { FlowChart } from "./FlowChart";
import { useWorkbenchState } from "./useWorkbenchState";
import { WindowSelector } from "./WindowSelector";

function localInput(ms: number) {
  return new Date(ms).toISOString().slice(0, 16);
}

/** The stablecoin mint and burn workspace: asset, window, chart, events, coverage. */
export function StablecoinFlows() {
  const work = useWorkbenchState();
  const [assetId, setAssetId] = useState("usdc");
  const [chains, setChains] = useState<string[]>([]);
  const [start, setStart] = useState(() => localInput(Date.now() - 7 * 86_400_000));
  const [end, setEnd] = useState(() => localInput(Date.now()));
  const [topEvents, setTopEvents] = useState(10);
  const report = work.result?.report;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Stablecoin mint and burn flows</h1>
      <p>
        Reads what each chain recorded as issued and redeemed for one configured stablecoin, aggregated by UTC day. It
        states supply flow only — it does not price the asset and forecasts no peg behaviour.
      </p>
      <AssetSelector
        assetId={assetId}
        chains={chains}
        busy={work.busy}
        onAssetChange={setAssetId}
        onChainsChange={setChains}
      />
      <WindowSelector
        start={start}
        end={end}
        topEvents={topEvents}
        busy={work.busy}
        onStartChange={setStart}
        onEndChange={setEnd}
        onTopEventsChange={setTopEvents}
        onSubmit={() =>
          void work.read({
            assetId,
            chains,
            windowStart: `${start}:00.000Z`,
            windowEnd: `${end}:00.000Z`,
            topEvents,
          })
        }
      />
      <p role="status" aria-live="polite">
        {work.busy
          ? "Reading recorded mints and burns…"
          : work.result?.state === "unavailable"
            ? work.result.reason
            : report
              ? `Report ${report.state}. Net issuance ${report.netIssuance.net} ${report.asset.symbol} across ${report.window.days} day(s).`
              : "Choose an asset and a window to begin."}
      </p>
      {work.error ? <p role="alert">{work.error}</p> : null}
      {report && work.result?.state === "ready" ? (
        <>
          <section className="space-y-2" aria-label="Net issuance">
            <h2 className="text-lg font-semibold">Net issuance</h2>
            <p className="tabular-nums">
              Minted {report.netIssuance.mint} · Burned {report.netIssuance.burn} · Net {report.netIssuance.net}{" "}
              {report.asset.symbol} from {report.netIssuance.eventCount} event(s)
            </p>
            <ul className="list-inside list-disc text-sm">
              {report.netByChain.map((row) => (
                <li key={row.chain}>
                  {row.chain}: minted {row.mint}, burned {row.burn}, net {row.net} {report.asset.symbol}
                </li>
              ))}
            </ul>
          </section>
          <FlowChart daily={report.daily} coverage={report.coverage} symbol={report.asset.symbol} />
          <EventList events={report.largestEvents} symbol={report.asset.symbol} />
          <CoverageNotice coverage={report.coverage} notes={report.notes} />
        </>
      ) : null}
      {report && work.result?.state === "unavailable" ? (
        <CoverageNotice coverage={report.coverage} notes={report.notes} />
      ) : null}
    </div>
  );
}
