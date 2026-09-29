"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Route } from "lucide-react";
import { useWalletSession } from "@/hooks/useWalletSession";
import { isE2eTestMode, readE2eWalletOverride } from "@/lib/e2e/browserWallet";
import type { PathPaymentResult } from "@/server/research/path-payment/schema";

export function PathPaymentInspector() {
  const wallet = useWalletSession();
  const test = isE2eTestMode() ? readE2eWalletOverride() : null;
  const override = test?.family === "stellar" ? test : null;
  const address = wallet.family === "stellar" ? wallet.address ?? override?.address : override?.address;
  const walletNetwork =
    wallet.family === "stellar" ? wallet.stellar.network ?? override?.network : override?.network;

  const [network, setNetwork] = useState<"stellar-testnet" | "stellar-pubnet">(walletNetwork ?? "stellar-testnet");
  const [mode, setMode] = useState<"strict_send" | "strict_receive">("strict_send");
  const [sourceAsset, setSourceAsset] = useState("XLM");
  const [destinationAsset, setDestinationAsset] = useState("");
  const [amount, setAmount] = useState("1");
  const [view, setView] = useState<{
    scope: string;
    result: PathPaymentResult | null;
    error: string | null;
    busy: boolean;
  }>({ scope: "", result: null, error: null, busy: false });
  const generation = useRef(0);
  const scope = `${address}:${network}:${mode}:${sourceAsset}:${destinationAsset}:${amount}`;

  useEffect(() => {
    generation.current += 1;
  }, [address]);

  const result = view.scope === scope ? view.result : null;
  const error = view.scope === scope ? view.error : null;
  const busy = view.scope === scope && view.busy;
  const connected = Boolean(address && ((wallet.family === "stellar" && wallet.isConnected) || override));
  const mismatch = Boolean(walletNetwork && walletNetwork !== network);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !walletNetwork || mismatch || !destinationAsset.trim()) return;
    const token = ++generation.current;
    setView({ scope, result: null, error: null, busy: true });
    try {
      const response = await fetch("/api/insights/path-payment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork,
          mode,
          sourceAsset,
          destinationAsset,
          amount,
        }),
      });
      const payload = (await response.json()) as PathPaymentResult & { error?: string };
      if (token !== generation.current) return;
      if (!response.ok && payload.state !== "unavailable") throw new Error(payload.error ?? "Inspector unavailable");
      if (payload.walletAddress !== address || payload.network !== network) return;
      setView({ scope, result: payload, error: null, busy: false });
    } catch (cause) {
      if (token === generation.current) {
        setView({
          scope,
          result: null,
          error: cause instanceof Error ? cause.message : "Inspector unavailable",
          busy: false,
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex gap-4 border-b border-white/10 pb-5">
        <div className="rounded-2xl border border-[#d9a441]/35 p-3 text-[#f2c86d]">
          <Route />
        </div>
        <div>
          <div className="text-xs uppercase tracking-[.18em] text-[#d9a441]">Stellar insight</div>
          <h1 className="text-3xl font-semibold">Path-payment route inspector</h1>
          <p className="mt-2 text-sm text-white/55">
            Explain hop assets, venues, and failure conditions without submitting a payment.
          </p>
        </div>
      </header>
      {!connected ? (
        <div role="status" className="rounded-xl border border-amber-300/20 p-4">
          Connect an authenticated Stellar wallet.
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-red-300/20 p-4">
          {error}
        </div>
      ) : null}
      <form onSubmit={submit} className="glass-panel grid gap-4 rounded-2xl p-5">
        <label className="grid gap-1 text-sm">
          <span>Network</span>
          <select
            value={network}
            disabled={busy || !connected}
            onChange={(event) => {
              generation.current += 1;
              setNetwork(event.target.value as "stellar-testnet" | "stellar-pubnet");
            }}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          >
            <option value="stellar-testnet">stellar-testnet</option>
            <option value="stellar-pubnet">stellar-pubnet</option>
          </select>
        </label>
        {mismatch ? (
          <div role="alert" className="rounded-xl border border-amber-300/20 p-3 text-sm">
            Selected network does not match the connected wallet network.
          </div>
        ) : null}
        <label className="grid gap-1 text-sm">
          <span>Mode</span>
          <select
            value={mode}
            disabled={busy || !connected}
            onChange={(event) => setMode(event.target.value as "strict_send" | "strict_receive")}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          >
            <option value="strict_send">strict-send</option>
            <option value="strict_receive">strict-receive</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>Source asset</span>
          <input
            value={sourceAsset}
            disabled={busy || !connected}
            onChange={(event) => setSourceAsset(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Destination asset</span>
          <input
            value={destinationAsset}
            disabled={busy || !connected}
            onChange={(event) => setDestinationAsset(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Amount</span>
          <input
            value={amount}
            disabled={busy || !connected}
            onChange={(event) => setAmount(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
            required
          />
        </label>
        <button
          type="submit"
          disabled={busy || !connected || mismatch}
          className="rounded-full border border-[#d9a441]/40 bg-[#d9a441]/15 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-40"
        >
          Inspect path routes
        </button>
      </form>
      <div aria-live="polite" className="sr-only">
        {busy ? "Loading path routes" : result ? result.state : ""}
      </div>
      {result ? (
        <>
          <section
            className={`rounded-2xl border p-4 ${result.state === "complete" ? "border-emerald-300/20" : "border-amber-300/20"}`}
          >
            <strong>{result.state}</strong>
            <p className="mt-1 text-sm">{result.coverageMessage}</p>
            <div className="mt-2 text-xs">
              {result.mode} · {result.sourceAssetKey} → {result.destinationAssetKey} · failure {result.primaryFailure} ·
              ledger {result.observation.ledger ?? "unavailable"}
            </div>
            {result.warnings.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </section>
          <section aria-labelledby="routes-heading" className="rounded-2xl border border-white/10 p-4">
            <h2 id="routes-heading" className="text-lg font-semibold">
              Routes
            </h2>
            <ol aria-label="Path payment routes" className="mt-3 space-y-4">
              {result.routes.map((route) => (
                <li key={route.id} tabIndex={0} className="rounded-xl border border-white/10 p-3 focus:outline focus:outline-2 focus:outline-[#d9a441]">
                  <div className="font-medium">
                    {route.id} · src {route.sourceAmount} · dest {route.destinationAmount} ·{" "}
                    {route.simulated ? "simulated" : "estimate"}
                  </div>
                  <table className="mt-2 w-full text-left text-xs" aria-label={`Hops for ${route.id}`}>
                    <thead>
                      <tr className="text-white/45">
                        <th scope="col">#</th>
                        <th scope="col">From</th>
                        <th scope="col">To</th>
                        <th scope="col">Venue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {route.hops.map((hop) => (
                        <tr key={`${route.id}-${hop.index}`} className="border-t border-white/10">
                          <td className="py-1">{hop.index + 1}</td>
                          <td className="break-all py-1 font-mono">{hop.fromAssetKey}</td>
                          <td className="break-all py-1 font-mono">{hop.toAssetKey}</td>
                          <td className="py-1">{hop.venue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </li>
              ))}
            </ol>
            {!result.routes.length ? <p className="mt-2 text-sm text-white/55">No routes to display.</p> : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
