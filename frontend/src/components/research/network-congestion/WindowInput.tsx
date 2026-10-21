"use client";

import { useId, useState, type FormEvent } from "react";
import type { CongestionRequest } from "@/server/research/network-congestion/schema";

type WindowMode = "sequences" | "times" | "atTime" | "atLedger";

const MODES: { id: WindowMode; label: string }[] = [
  { id: "sequences", label: "Ledger range" },
  { id: "times", label: "Close-time range" },
  { id: "atTime", label: "Around a time" },
  { id: "atLedger", label: "Around a ledger" },
];

function fieldClass() {
  return "w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40";
}

function toIso(value: string): string | null {
  if (!value) return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString();
}

/**
 * The window is turned into an explicit request in the browser.
 * A relative phrase such as "last hour" is not sent to the server.
 */
export function WindowInput({ busy, onSubmit }: { busy: boolean; onSubmit: (request: CongestionRequest) => void }) {
  const baseId = useId();
  const [mode, setMode] = useState<WindowMode>("sequences");
  const [network, setNetwork] = useState("stellar-pubnet");
  const [fromSequence, setFromSequence] = useState("");
  const [toSequence, setToSequence] = useState("");
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [atTime, setAtTime] = useState("");
  const [atLedger, setAtLedger] = useState("");
  const [radius, setRadius] = useState("4");
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedRadius = Number(radius);

    if (mode === "sequences") {
      const from = Number(fromSequence);
      const to = Number(toSequence);

      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
        setProblem("Enter both ledger sequences as whole numbers.");
        return;
      }

      setProblem(null);
      onSubmit({ network, fromSequence: from, toSequence: to });
      return;
    }

    if (mode === "times") {
      const from = toIso(fromTime);
      const to = toIso(toTime);

      if (!from || !to) {
        setProblem("Enter both close times.");
        return;
      }

      setProblem(null);
      onSubmit({ network, fromTime: from, toTime: to });
      return;
    }

    if (!Number.isInteger(parsedRadius) || parsedRadius < 0) {
      setProblem("Radius is a whole number of ledgers.");
      return;
    }

    if (mode === "atTime") {
      const at = toIso(atTime);

      if (!at) {
        setProblem("Enter the time to look up.");
        return;
      }

      setProblem(null);
      onSubmit({ network, atTime: at, radius: parsedRadius });
      return;
    }

    const ledger = Number(atLedger);

    if (!Number.isInteger(ledger) || ledger < 1) {
      setProblem("Enter the ledger to look up.");
      return;
    }

    setProblem(null);
    onSubmit({ network, atLedger: ledger, radius: parsedRadius });
  }

  return (
    <form aria-label="Network congestion window" className="glass-panel flex flex-col gap-4 rounded-[28px] p-5 sm:p-6" onSubmit={submit}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${baseId}-network`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            Network
          </label>
          <select id={`${baseId}-network`} value={network} onChange={(event) => setNetwork(event.target.value)} className={fieldClass()}>
            <option value="stellar-pubnet" className="bg-[#151515]">
              Stellar public
            </option>
            <option value="stellar-testnet" className="bg-[#151515]">
              Stellar testnet
            </option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${baseId}-mode`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            Window
          </label>
          <select id={`${baseId}-mode`} value={mode} onChange={(event) => setMode(event.target.value as WindowMode)} className={fieldClass()}>
            {MODES.map((entry) => (
              <option key={entry.id} value={entry.id} className="bg-[#151515]">
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        {mode === "sequences" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${baseId}-from-ledger`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
                From ledger
              </label>
              <input id={`${baseId}-from-ledger`} inputMode="numeric" value={fromSequence} onChange={(event) => setFromSequence(event.target.value)} className={fieldClass()} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${baseId}-to-ledger`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
                To ledger
              </label>
              <input id={`${baseId}-to-ledger`} inputMode="numeric" value={toSequence} onChange={(event) => setToSequence(event.target.value)} className={fieldClass()} />
            </div>
          </>
        ) : null}

        {mode === "times" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${baseId}-from-time`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
                From time
              </label>
              <input id={`${baseId}-from-time`} type="datetime-local" value={fromTime} onChange={(event) => setFromTime(event.target.value)} className={fieldClass()} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${baseId}-to-time`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
                To time
              </label>
              <input id={`${baseId}-to-time`} type="datetime-local" value={toTime} onChange={(event) => setToTime(event.target.value)} className={fieldClass()} />
            </div>
          </>
        ) : null}

        {mode === "atTime" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${baseId}-at-time`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
              Time
            </label>
            <input id={`${baseId}-at-time`} type="datetime-local" value={atTime} onChange={(event) => setAtTime(event.target.value)} className={fieldClass()} />
          </div>
        ) : null}

        {mode === "atLedger" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${baseId}-at-ledger`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
              Ledger
            </label>
            <input id={`${baseId}-at-ledger`} inputMode="numeric" value={atLedger} onChange={(event) => setAtLedger(event.target.value)} className={fieldClass()} />
          </div>
        ) : null}

        {mode === "atTime" || mode === "atLedger" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${baseId}-radius`} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
              Radius
            </label>
            <input id={`${baseId}-radius`} inputMode="numeric" value={radius} onChange={(event) => setRadius(event.target.value)} className={fieldClass()} />
          </div>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="text-sm text-red-200">
          {problem}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-2xl border border-white/14 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Reading…" : "Show conditions"}
      </button>
    </form>
  );
}
