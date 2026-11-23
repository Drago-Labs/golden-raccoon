"use client";

import { useState } from "react";
import { AttributionTable } from "./AttributionTable";
import { CoverageNotice } from "./CoverageNotice";
import { PeriodSelector } from "./PeriodSelector";
import { PortfolioSelector } from "./PortfolioSelector";
import { useWorkbenchState } from "./useWorkbenchState";
import { WaterfallChart } from "./WaterfallChart";

function localInput(ms: number) {
  return new Date(ms).toISOString().slice(0, 16);
}

/** The performance attribution workspace: portfolio, periods, waterfall, tables, coverage. */
export function AttributionReport() {
  const work = useWorkbenchState();
  const [walletAddress, setWalletAddress] = useState("");
  const [network, setNetwork] = useState("ethereum");
  const [includeLiveSnapshot, setIncludeLiveSnapshot] = useState(false);
  const [start, setStart] = useState(() => localInput(Date.now() - 7 * 86_400_000));
  const [end, setEnd] = useState(() => localInput(Date.now()));
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const report = work.result?.report;
  const attributed = report?.periods.filter((period) => period.state !== "unavailable") ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Portfolio performance attribution</h1>
      <p>
        Breaks an observed change in portfolio value into what entered or left the portfolio and what the market did,
        per asset, chain and period. It attributes recorded value only — it is not tax reporting and not advice.
      </p>
      <PortfolioSelector
        walletAddress={walletAddress}
        network={network}
        includeLiveSnapshot={includeLiveSnapshot}
        busy={work.busy}
        onWalletChange={setWalletAddress}
        onNetworkChange={setNetwork}
        onIncludeLiveChange={setIncludeLiveSnapshot}
      />
      <PeriodSelector
        start={start}
        end={end}
        granularity={granularity}
        busy={work.busy}
        onStartChange={setStart}
        onEndChange={setEnd}
        onGranularityChange={setGranularity}
        onSubmit={() =>
          void work.read({
            walletAddress: walletAddress.trim(),
            network,
            windowStart: `${start}:00.000Z`,
            windowEnd: `${end}:00.000Z`,
            granularity,
            includeLiveSnapshot,
          })
        }
      />
      <p role="status" aria-live="polite">
        {work.busy
          ? "Attributing recorded observations…"
          : work.result?.state === "unavailable"
            ? work.result.reason
            : report
              ? `Report ${report.state}. Market movement ${report.totals.marketUsd ?? "unavailable"} USD across ${report.totals.attributedPeriods} attributed period(s).`
              : "Choose a portfolio and a window to begin."}
      </p>
      {work.error ? <p role="alert">{work.error}</p> : null}
      {report && work.result?.state === "ready" ? (
        <>
          <WaterfallChart
            totals={report.totals}
            startValueUsd={attributed[0]?.startValueUsd ?? null}
            endValueUsd={attributed[attributed.length - 1]?.endValueUsd ?? null}
          />
          <AttributionTable periods={report.periods} />
          <CoverageNotice report={report} />
        </>
      ) : null}
      {report && work.result?.state === "unavailable" ? <CoverageNotice report={report} /> : null}
    </div>
  );
}
