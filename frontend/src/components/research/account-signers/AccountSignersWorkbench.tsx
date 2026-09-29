"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { useWalletSession } from "@/hooks/useWalletSession";
import { isE2eTestMode, readE2eWalletOverride } from "@/lib/e2e/browserWallet";
import type { AccountSignersResult } from "@/server/research/account-signers/schema";

export function AccountSignersWorkbench() {
  const wallet = useWalletSession();
  const test = isE2eTestMode() ? readE2eWalletOverride() : null;
  const override = test?.family === "stellar" ? test : null;
  const address = wallet.family === "stellar" ? wallet.address ?? override?.address : override?.address;
  const walletNetwork =
    wallet.family === "stellar" ? wallet.stellar.network ?? override?.network : override?.network;

  const [network, setNetwork] = useState<"stellar-testnet" | "stellar-pubnet">(walletNetwork ?? "stellar-testnet");
  const [accountAddress, setAccountAddress] = useState(address ?? "");
  const [view, setView] = useState<{
    scope: string;
    result: AccountSignersResult | null;
    error: string | null;
    busy: boolean;
  }>({ scope: "", result: null, error: null, busy: false });
  const generation = useRef(0);
  const scope = `${address}:${network}:${accountAddress}`;

  useEffect(() => {
    generation.current += 1;
    if (address) setAccountAddress(address);
  }, [address]);

  const result = view.scope === scope ? view.result : null;
  const error = view.scope === scope ? view.error : null;
  const busy = view.scope === scope && view.busy;
  const connected = Boolean(address && ((wallet.family === "stellar" && wallet.isConnected) || override));
  const mismatch = Boolean(walletNetwork && walletNetwork !== network);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !walletNetwork || mismatch) return;
    const token = ++generation.current;
    setView({ scope, result: null, error: null, busy: true });
    try {
      const response = await fetch("/api/insights/account-signers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          accountAddress: accountAddress || address,
          network,
          walletNetwork,
        }),
      });
      const payload = (await response.json()) as AccountSignersResult & { error?: string };
      if (token !== generation.current) return;
      if (!response.ok && payload.state !== "unavailable") throw new Error(payload.error ?? "Workbench unavailable");
      if (payload.walletAddress !== address || payload.network !== network) return;
      setView({ scope, result: payload, error: null, busy: false });
    } catch (cause) {
      if (token === generation.current) {
        setView({
          scope,
          result: null,
          error: cause instanceof Error ? cause.message : "Workbench unavailable",
          busy: false,
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex gap-4 border-b border-white/10 pb-5">
        <div className="rounded-2xl border border-[#d9a441]/35 p-3 text-[#f2c86d]">
          <KeyRound />
        </div>
        <div>
          <div className="text-xs uppercase tracking-[.18em] text-[#d9a441]">Stellar insight</div>
          <h1 className="text-3xl font-semibold">Account signer thresholds</h1>
          <p className="mt-2 text-sm text-white/55">
            Explain observed signer weights and classic operation reachability without implying private-key possession.
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
          <span>Account (G-address)</span>
          <input
            value={accountAddress}
            disabled={busy || !connected}
            onChange={(event) => setAccountAddress(event.target.value.trim())}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !connected || mismatch}
          className="rounded-full border border-[#d9a441]/40 bg-[#d9a441]/15 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-40"
        >
          Inspect signer policy
        </button>
      </form>
      <div aria-live="polite" className="sr-only">
        {busy ? "Loading account signers" : result ? result.state : ""}
      </div>
      {result ? (
        <>
          <section
            className={`rounded-2xl border p-4 ${result.state === "complete" ? "border-emerald-300/20" : "border-amber-300/20"}`}
          >
            <strong>{result.state}</strong>
            <p className="mt-1 text-sm">{result.coverageMessage}</p>
            <div className="mt-2 text-xs">
              Ledger {result.observation.ledger ?? "unavailable"} · source {result.observation.source ?? "unavailable"} ·
              total weight {result.totalWeight}
            </div>
            {result.warnings.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </section>
          {result.thresholds ? (
            <section aria-labelledby="thresholds-heading" className="rounded-2xl border border-white/10 p-4">
              <h2 id="thresholds-heading" className="text-lg font-semibold">
                Thresholds
              </h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-white/45">Low</dt>
                  <dd>{result.thresholds.low}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Medium</dt>
                  <dd>{result.thresholds.medium}</dd>
                </div>
                <div>
                  <dt className="text-white/45">High</dt>
                  <dd>{result.thresholds.high}</dd>
                </div>
                <div>
                  <dt className="text-white/45">Master weight</dt>
                  <dd>{result.thresholds.masterWeight}</dd>
                </div>
              </dl>
            </section>
          ) : null}
          <section aria-labelledby="signers-heading" className="rounded-2xl border border-white/10 p-4">
            <h2 id="signers-heading" className="text-lg font-semibold">
              Signers
            </h2>
            <table className="mt-3 w-full text-left text-sm" aria-label="Account signers">
              <thead>
                <tr className="text-white/45">
                  <th scope="col">Key</th>
                  <th scope="col">Weight</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Sponsor</th>
                </tr>
              </thead>
              <tbody>
                {result.signers.map((signer) => (
                  <tr key={signer.key} tabIndex={0} className="border-t border-white/10 focus:outline focus:outline-2 focus:outline-[#d9a441]">
                    <td className="break-all py-2 font-mono text-xs">{signer.key}</td>
                    <td className="py-2">{signer.weight}</td>
                    <td className="py-2">{signer.kind}</td>
                    <td className="break-all py-2 font-mono text-xs">{signer.sponsor ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section aria-labelledby="ops-heading" className="rounded-2xl border border-white/10 p-4">
            <h2 id="ops-heading" className="text-lg font-semibold">
              Classic operation reachability
            </h2>
            <p className="mt-1 text-sm text-white/55">
              Reachable means observed weights meet the threshold — not that a private key is held.
            </p>
            <ul aria-label="Operation matrix" className="mt-3 space-y-2 text-sm">
              {result.operations.map((operation) => (
                <li key={operation.operation} tabIndex={0} className="rounded-xl border border-white/10 p-3 focus:outline focus:outline-2 focus:outline-[#d9a441]">
                  <strong>{operation.operation}</strong> · {operation.band} · required {operation.requiredWeight} ·{" "}
                  {operation.reachable ? "reachable" : "not reachable"}
                  <p className="mt-1 text-xs text-white/45">{operation.note}</p>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="soroban-heading" className="rounded-2xl border border-white/10 p-4">
            <h2 id="soroban-heading" className="text-lg font-semibold">
              Soroban authorization
            </h2>
            <p className="mt-1 text-sm">{result.sorobanAuthorization.note}</p>
            <p className="mt-1 text-xs text-white/45">State: {result.sorobanAuthorization.state}</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
