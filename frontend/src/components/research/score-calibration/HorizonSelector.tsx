"use client";

import { FormEvent, useState } from "react";
import type { HorizonDays, OutcomeType } from "@/server/research/score-calibration/schema";

const OUTCOME_OPTIONS: { value: OutcomeType; label: string }[] = [
  { value: "large_drawdown", label: "Large drawdown" },
  { value: "depeg", label: "Depeg" },
  { value: "incident_report", label: "Incident report" },
];

export function HorizonSelector(props: {
  defaultOutcomeType?: OutcomeType;
  defaultHorizonDays?: HorizonDays;
  defaultNetwork?: "testnet" | "pubnet";
  busy?: boolean;
  onSubmit: (outcomeType: OutcomeType, horizonDays: HorizonDays, network: "testnet" | "pubnet") => void;
}) {
  const [outcomeType, setOutcomeType] = useState<OutcomeType>(props.defaultOutcomeType ?? "large_drawdown");
  const [horizonDays, setHorizonDays] = useState<HorizonDays>(props.defaultHorizonDays ?? 30);
  const [network, setNetwork] = useState<"testnet" | "pubnet">(props.defaultNetwork ?? "pubnet");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit(outcomeType, horizonDays, network);
  }

  return (
    <form aria-label="Score calibration horizon and outcome selector" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm sm:w-48">
          <span className="text-muted">Outcome</span>
          <select
            name="outcomeType"
            value={outcomeType}
            onChange={(event) => setOutcomeType(event.target.value as OutcomeType)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
          >
            {OUTCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:w-32">
          <span className="text-muted">Horizon</span>
          <select
            name="horizonDays"
            value={horizonDays}
            onChange={(event) => setHorizonDays(Number(event.target.value) as HorizonDays)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:w-32">
          <span className="text-muted">Network</span>
          <select
            name="network"
            value={network}
            onChange={(event) => setNetwork(event.target.value as "testnet" | "pubnet")}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
          >
            <option value="pubnet">Pubnet</option>
            <option value="testnet">Testnet</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={props.busy}
          className="self-start rounded-xl border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] outline-none transition hover:bg-[#d9a441]/15 focus-visible:ring-2 focus-visible:ring-[#d9a441]/60 disabled:opacity-50"
        >
          {props.busy ? "Building…" : "Build report"}
        </button>
      </div>
    </form>
  );
}
