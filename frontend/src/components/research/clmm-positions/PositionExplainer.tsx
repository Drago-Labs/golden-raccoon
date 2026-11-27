"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { ClmmPositionsReport } from "@/server/research/clmm-positions/schema";
import { AddressInput } from "./AddressInput";
import { CoverageNotice } from "./CoverageNotice";
import { FeePanel } from "./FeePanel";
import { PositionList } from "./PositionList";
import { RangeVisual } from "./RangeVisual";
import { useWorkbenchState } from "./useWorkbenchState";

type Network = "ethereum" | "base" | "arbitrum";

export function PositionExplainer({ initialNetwork = "ethereum" }: { initialNetwork?: Network }) {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const { view, setView } = useWorkbenchState();

  const selected = useMemo(() => {
    if (view.status !== "ready") return undefined;
    return view.report.positions.find((p) => p.tokenId === selectedTokenId) ?? view.report.positions[0];
  }, [view, selectedTokenId]);

  async function explain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setView({ status: "loading" });
    setSelectedTokenId(null);

    const response = await fetch("/api/insights/clmm-positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address, network }),
    });

    const body = (await response.json()) as {
      report?: ClmmPositionsReport;
      message?: string;
      error?: string;
    };

    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Explanation failed." });
      return;
    }

    setSelectedTokenId(body.report.positions[0]?.tokenId ?? null);
    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Concentrated liquidity position explainer"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={explain}
      >
        <AddressInput
          address={address}
          network={network}
          disabled={view.status === "loading"}
          onAddress={setAddress}
          onNetwork={(value) => setNetwork(value as Network)}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          {view.status === "loading" ? "Reading…" : "Explain positions"}
        </button>
        <p data-testid="clmm-positions-idle" className="text-sm text-muted">
          Read-only Uniswap v3-style position ranges, token composition, and uncollected fees. Managing or collecting
          is out of scope.
        </p>
      </form>

      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}

      {view.status === "ready" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Open {view.report.totals.openPositions} · closed {view.report.totals.closedPositions} · in range{" "}
            {view.report.totals.inRangePositions} · out of range {view.report.totals.outOfRangePositions}
          </p>
          <PositionList
            positions={view.report.positions}
            selectedTokenId={selected?.tokenId ?? null}
            onSelect={setSelectedTokenId}
          />
          {selected ? <RangeVisual position={selected} /> : null}
          <FeePanel position={selected} totals={view.report.totals} />
          <CoverageNotice
            notice={view.report.coverageNotice}
            items={view.report.coverage}
            state={view.report.state}
          />
        </div>
      ) : null}
    </div>
  );
}
