"use client";
import { FormEvent, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import type { GovernanceQueueView } from "@/server/research/governance-queue";

export function GovernanceQueueWorkspace() {
  const [network, setNetwork] = useState<"testnet" | "pubnet">("testnet");
  const [view, setView] = useState<{ result?: GovernanceQueueView; error?: string; busy: boolean }>({ busy: false });
  const generation = useRef(0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = ++generation.current;
    setView({ busy: true });
    try {
      const response = await fetch("/api/insights/governance-queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ network }),
      });
      const body = (await response.json()) as GovernanceQueueView & { error?: string };
      if (token !== generation.current) return;
      if (!response.ok && !body.state) throw new Error(body.error ?? "Governance read failed");
      setView({ result: body, busy: false });
    } catch (error) {
      if (token === generation.current) setView({ error: error instanceof Error ? error.message : "Governance read failed", busy: false });
    }
  }

  const result = view.result;
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase text-[#d9a441]">Soroban insight</div>
        <h1 className="text-3xl font-semibold">Pending governance queue</h1>
        <p className="text-sm text-white/55">Read-only view of pending timelocked changes. Readiness never means authorized or safe to execute.</p>
      </header>
      <form onSubmit={submit} className="glass-panel grid gap-4 rounded-2xl p-5">
        <label className="grid gap-1 text-sm">
          Network
          <select aria-label="Network" value={network} onChange={(event) => setNetwork(event.target.value as "testnet" | "pubnet")} className="rounded border border-white/15 bg-black/40 p-2">
            <option value="testnet">Testnet</option>
            <option value="pubnet">Pubnet</option>
          </select>
        </label>
        <button type="submit" disabled={view.busy} className="rounded bg-[#d9a441] px-4 py-2 font-medium text-black disabled:opacity-50">{view.busy ? "Reading…" : "Read pending queue"}</button>
      </form>
      <LiveRegion message={view.busy ? "Reading governance queue" : view.error ? view.error : result ? `Queue state ${result.state}` : null} politeness={view.error ? "assertive" : "polite"} />
      {view.error ? <div role="alert">{view.error}</div> : null}
      {result ? (
        <section className="space-y-4" aria-labelledby="gov-queue-heading">
          <h2 id="gov-queue-heading" className="text-xl font-semibold">State: {result.state}</h2>
          <p className="text-sm text-white/60">Contract {result.contractId ?? "unset"} · ledger {result.ledger ?? "unknown"}</p>
          {result.warnings.length ? <ul className="list-disc pl-5 text-sm text-amber-200">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Pending governance proposals</caption>
            <thead>
              <tr><th scope="col">Id</th><th scope="col">Target</th><th scope="col">Payload hash</th><th scope="col">Effective</th><th scope="col">Ready</th></tr>
            </thead>
            <tbody>
              {result.items.length === 0 ? (
                <tr><td colSpan={5}>{result.state === "empty" ? "Nothing pending." : "No decoded items."}</td></tr>
              ) : result.items.map((item) => {
                const ready = result.readiness.find((row) => row.id === item.id);
                return (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td className="font-mono text-xs">{item.targetContract}</td>
                    <td className="font-mono text-xs">{item.payloadHash}</td>
                    <td>{item.effectiveAt}</td>
                    <td>{item.cancelled ? "cancelled" : ready?.ready ? "timelock elapsed" : "waiting"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
