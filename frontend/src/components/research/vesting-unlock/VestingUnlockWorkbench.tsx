"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import type { VestingUnlockReport } from "@/server/research/vesting-unlock/schema";
import { CoveragePanel, TrancheTable, UnlockTimeline } from "./TrancheViews";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: VestingUnlockReport }
  | { status: "error"; code: string; message: string };

/**
 * Read-only vesting and unlock workbench.
 *
 * Keyed by network so switching networks discards the prior report. The form
 * never offers claim or schedule actions.
 */
export function VestingUnlockWorkbench(props: {
  network?: string | null;
  chainFamily?: "evm" | "stellar" | null;
  endpoint?: string;
}) {
  const sessionKey = `${props.chainFamily ?? "evm"}|${props.network ?? "ethereum"}`;

  return (
    <WorkbenchSession
      key={sessionKey}
      network={props.network ?? "ethereum"}
      chainFamily={props.chainFamily ?? "evm"}
      endpoint={props.endpoint ?? "/api/insights/vesting-unlock"}
    />
  );
}

function WorkbenchSession({
  network,
  chainFamily,
  endpoint,
}: {
  network: string;
  chainFamily: "evm" | "stellar";
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [sourceId, setSourceId] = useState(
    chainFamily === "stellar" ? "CVESTINGEXAMPLE000000000000000000000000000000000000000" : "0xvesting00000000000000000000000000000001",
  );
  const [sourceKind, setSourceKind] = useState<"evm_vesting_contract" | "stellar_vesting_contract" | "issuer_published">(
    chainFamily === "stellar" ? "stellar_vesting_contract" : "evm_vesting_contract",
  );
  const [displayTimeZone, setDisplayTimeZone] = useState("UTC");
  const [beneficiary, setBeneficiary] = useState("");
  const generation = useRef(0);

  const analyse = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      generation.current += 1;
      const requestGeneration = generation.current;

      setState({ status: "loading" });

      fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          network,
          chainFamily,
          displayTimeZone,
          ...(beneficiary.trim() ? { beneficiary: beneficiary.trim() } : {}),
          sources: [{ kind: sourceKind, id: sourceId.trim(), network }],
        }),
      })
        .then(async (response) => {
          const body = await response.json();

          if (requestGeneration !== generation.current) return;

          if (!response.ok && body?.report?.coverage?.state !== "unavailable") {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "vesting_unlock_failed",
              message: typeof body?.message === "string" ? body.message : "The vesting unlock analysis could not be completed.",
            });
            return;
          }

          if (!body?.report) {
            setState({
              status: "error",
              code: typeof body?.error === "string" ? body.error : "vesting_unlock_failed",
              message: typeof body?.message === "string" ? body.message : "The vesting unlock analysis could not be completed.",
            });
            return;
          }

          setState({ status: "ready", report: body.report });
        })
        .catch(() => {
          if (requestGeneration !== generation.current) return;
          setState({ status: "error", code: "network_error", message: "The analysis request could not be completed." });
        });
    },
    [beneficiary, chainFamily, displayTimeZone, endpoint, network, sourceId, sourceKind],
  );

  return (
    <div className="flex flex-col gap-6">
      <form aria-label="Vesting unlock sources" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4" onSubmit={analyse}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-white/42">Source kind</span>
            <select
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
              value={sourceKind}
              onChange={(event) => setSourceKind(event.target.value as typeof sourceKind)}
            >
              {chainFamily === "evm" ? <option value="evm_vesting_contract">EVM vesting contract</option> : null}
              {chainFamily === "stellar" ? <option value="stellar_vesting_contract">Stellar vesting contract</option> : null}
              <option value="issuer_published">Issuer-published schedule</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-white/42">Display time zone</span>
            <input
              className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
              value={displayTimeZone}
              onChange={(event) => setDisplayTimeZone(event.target.value)}
              aria-describedby="tz-help"
            />
            <span id="tz-help" className="text-xs text-white/42">
              Classification stays in UTC or ledger time; this zone labels the table only.
            </span>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-white/42">Source id</span>
          <input
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs uppercase tracking-[0.12em] text-white/42">Beneficiary filter (optional)</span>
          <input
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
            value={beneficiary}
            onChange={(event) => setBeneficiary(event.target.value)}
          />
        </label>
        <p className="text-xs text-white/42">
          Network <span className="font-mono text-white/70">{network}</span> · family{" "}
          <span className="font-mono text-white/70">{chainFamily}</span>. This workbench is read-only: it never claims tokens or
          schedules transactions.
        </p>
        <button
          type="submit"
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
          disabled={state.status === "loading"}
        >
          {state.status === "loading" ? "Analysing unlocks…" : "Analyse vesting unlocks"}
        </button>
      </form>

      <LiveRegion
        message={
          state.status === "loading"
            ? "Analysing vesting unlocks"
            : state.status === "ready"
              ? `Coverage ${state.report.coverage.state}`
              : state.status === "error"
                ? state.message
                : null
        }
        politeness={state.status === "error" ? "assertive" : "polite"}
      />

      {state.status === "idle" ? (
        <p data-testid="vesting-idle" className="text-sm text-white/54">
          Supply a supported vesting contract or an issuer-published schedule. Published plans are labelled separately from
          onchain-enforced unlocks, and cancelled revisions are never counted ahead. No claim or schedule action is available.
        </p>
      ) : null}

      {state.status === "error" ? (
        <div data-testid="vesting-error" role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          <p className="font-mono text-xs">{state.code}</p>
          <p className="mt-1">{state.message}</p>
        </div>
      ) : null}

      {state.status === "ready" ? (
        <div data-testid="vesting-summary" className="flex flex-col gap-6">
          <CoveragePanel report={state.report} />
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Timeline</h2>
            <UnlockTimeline report={state.report} />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Tranches</h2>
            <TrancheTable tranches={state.report.tranches} displayTimeZone={state.report.displayTimeZone} />
          </section>
        </div>
      ) : null}
    </div>
  );
}
