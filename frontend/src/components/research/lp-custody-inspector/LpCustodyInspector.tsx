"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { LpCustodyResult } from "@/server/research/lp-custody-inspector";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type CandidateDraft = { address: string; label: string; claimedUnlockTimestamp: string };

function formatBasisPoints(value: number | null): string {
  if (value === null) return "—";
  return `${(value / 100).toFixed(2)}%`;
}

function classificationLabel(classification: LpCustodyResult["candidates"][number]["classification"]): string {
  if (classification === "burned") return "Burn address (conventional, not cryptographically proven)";
  if (classification === "claimed_lock") return "Caller-claimed lock (unverified)";
  return "Unknown holder";
}

export function LpCustodyInspector() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(address && wallet.family === "evm" && wallet.isConnected);
  const [network, setNetwork] = useState("ethereum");
  const [poolAddress, setPoolAddress] = useState("");
  const [candidates, setCandidates] = useState<CandidateDraft[]>([]);
  const [draft, setDraft] = useState<CandidateDraft>({ address: "", label: "", claimedUnlockTimestamp: "" });
  const [result, setResult] = useState<LpCustodyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  function addCandidate() {
    if (!ADDRESS.test(draft.address)) {
      setError("Enter a valid candidate address before adding it.");
      return;
    }
    setCandidates((current) => [...current, draft]);
    setDraft({ address: "", label: "", claimedUnlockTimestamp: "" });
    setError(null);
  }

  function removeCandidate(index: number) {
    setCandidates((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || wallet.family !== "evm") return;
    if (!ADDRESS.test(poolAddress)) {
      setError("Enter a valid pool address.");
      return;
    }
    const requestGeneration = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/lp-custody-inspector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          poolAddress,
          candidates: candidates.map((candidate) => ({
            address: candidate.address,
            label: candidate.label || undefined,
            claimedUnlockTimestamp: candidate.claimedUnlockTimestamp ? Number(candidate.claimedUnlockTimestamp) : undefined,
          })),
        }),
      });
      const payload = (await response.json()) as LpCustodyResult & { error?: string; message?: string };
      if (requestGeneration !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Custody read failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(caught instanceof Error ? caught.message : "Custody read failed");
        setResult(null);
      }
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-white/10 pb-5">
        <div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Security insight</div>
        <h1 className="mt-1 text-3xl font-semibold">LP token custody inspector</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Reads who holds a pool&apos;s LP tokens at one block: burn addresses, addresses you nominate as claimed
          locks, and everything else. A burn address or a lock label is never treated as proof of permanent liquidity,
          and supply this scan did not check is reported as unknown, never as zero risk.
        </p>
      </header>

      {!connected && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Connect an EVM wallet to run a read-only custody scan.</p>}

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-white/10 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span>Network</span>
            <select value={network} onChange={(event) => setNetwork(event.target.value)} className="rounded-lg border border-white/15 bg-transparent p-2">
              <option value="ethereum">Ethereum</option>
              <option value="base">Base</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="polygon">Polygon</option>
              <option value="optimism">Optimism</option>
              <option value="bsc">BNB Chain</option>
              <option value="avalanche">Avalanche</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Pool address</span>
            <input value={poolAddress} onChange={(event) => setPoolAddress(event.target.value)} placeholder="0x…" className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs" />
          </label>
        </div>

        <fieldset className="space-y-3 rounded-lg border border-white/10 p-4">
          <legend className="px-1 text-sm font-medium">Candidate holders to check (burn addresses are always checked automatically)</legend>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <label className="flex flex-col gap-1 text-xs">
              <span>Address</span>
              <input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="0x…" className="rounded-lg border border-white/15 bg-transparent p-2 font-mono" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span>Label (optional)</span>
              <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="e.g. Team Finance" className="rounded-lg border border-white/15 bg-transparent p-2" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span>Claimed unlock (unix seconds, optional)</span>
              <input value={draft.claimedUnlockTimestamp} onChange={(event) => setDraft({ ...draft, claimedUnlockTimestamp: event.target.value })} inputMode="numeric" className="rounded-lg border border-white/15 bg-transparent p-2" />
            </label>
            <button type="button" onClick={addCandidate} className="self-end rounded-lg border border-white/20 px-3 py-2 text-xs">Add</button>
          </div>
          {candidates.length > 0 && (
            <ul className="space-y-1 text-xs text-white/70">
              {candidates.map((candidate, index) => (
                <li key={`${candidate.address}-${index}`} className="flex items-center justify-between gap-2">
                  <span className="font-mono">{candidate.address}{candidate.label ? ` (${candidate.label})` : ""}</span>
                  <button type="button" onClick={() => removeCandidate(index)} className="underline underline-offset-2">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <button type="submit" disabled={busy || !connected} className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-50">
          {busy ? "Reading…" : "Read custody evidence"}
        </button>
      </form>

      <div aria-live="polite" className="sr-only">
        {busy ? "LP custody read loading" : result ? `LP custody read ${result.state}` : error ?? ""}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}

      {result && (
        <section aria-label="Custody results" className="space-y-5 rounded-xl border border-white/10 p-5">
          <dl className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><dt className="text-white/50">Model</dt><dd>{result.model}</dd></div>
            <div><dt className="text-white/50">Block</dt><dd>{result.blockNumber ?? "unavailable"}</dd></div>
            <div><dt className="text-white/50">Total supply</dt><dd>{result.totalSupply ?? "unavailable"}</dd></div>
          </dl>

          {result.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          {result.summary && (
            <dl className="grid gap-3 sm:grid-cols-4 text-sm">
              <div><dt className="text-white/50">Burned</dt><dd>{formatBasisPoints(result.summary.burnedBasisPoints)}</dd></div>
              <div><dt className="text-white/50">Claimed locked (unverified)</dt><dd>{formatBasisPoints(result.summary.claimedLockedBasisPoints)}</dd></div>
              <div><dt className="text-white/50">Other identified</dt><dd>{formatBasisPoints(result.summary.otherIdentifiedBasisPoints)}</dd></div>
              <div><dt className="text-white/50">Unaccounted (unknown, not zero risk)</dt><dd>{formatBasisPoints(result.summary.unaccountedBasisPoints)}</dd></div>
            </dl>
          )}

          {result.candidates.length > 0 && (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Candidate holder evidence</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-white/50">
                  <th scope="col" className="pb-2">Address</th>
                  <th scope="col" className="pb-2">Classification</th>
                  <th scope="col" className="pb-2">Balance</th>
                  <th scope="col" className="pb-2">Share</th>
                  <th scope="col" className="pb-2">Lock claim</th>
                </tr>
              </thead>
              <tbody>
                {result.candidates.map((candidate) => (
                  <tr key={candidate.address} className="border-t border-white/10">
                    <td className="py-2 font-mono text-xs">{candidate.label ? `${candidate.label} (${candidate.address})` : candidate.address}</td>
                    <td className="py-2">{classificationLabel(candidate.classification)}</td>
                    <td className="py-2">{candidate.available ? candidate.balanceRaw : "unavailable — treated as unknown, not zero"}</td>
                    <td className="py-2">{formatBasisPoints(candidate.basisPoints)}</td>
                    <td className="py-2">
                      {candidate.lockClaim.status === "not_claimed"
                        ? "—"
                        : `${candidate.lockClaim.status === "claimed_future" ? "Claimed future unlock" : "Claimed unlock has passed"} (unverified)`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
