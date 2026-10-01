"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { PermitResult } from "@/server/research/permit-inspector";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function PermitInspector() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(address && wallet.family === "evm" && wallet.isConnected);
  const [network, setNetwork] = useState("ethereum");
  const [tokenAddress, setTokenAddress] = useState("");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [spenderAddress, setSpenderAddress] = useState("");
  const [result, setResult] = useState<PermitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || wallet.family !== "evm") return;
    if (!ADDRESS.test(tokenAddress) || !ADDRESS.test(ownerAddress)) {
      setError("Enter a valid token address and owner address.");
      return;
    }
    const requestGeneration = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/permit-inspector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          tokenAddress,
          ownerAddress,
          spenderAddress: ADDRESS.test(spenderAddress) ? spenderAddress : undefined,
        }),
      });
      const payload = (await response.json()) as PermitResult & { error?: string; message?: string };
      if (requestGeneration !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Permit read failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(caught instanceof Error ? caught.message : "Permit read failed");
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
        <h1 className="mt-1 text-3xl font-semibold">Permit &amp; domain inspector</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
          Reads a token&apos;s EIP-2612 permit capability and, separately, whether Permit2 already has a recorded
          allowance for a spender. This never accepts, stores, or submits a signature, and it never treats a domain
          mismatch or an unreadable nonce as safe.
        </p>
      </header>

      {!connected && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">Connect an EVM wallet to run a read-only permit scan.</p>}

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
            <span>Token address</span>
            <input value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} placeholder="0x…" className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Owner address</span>
            <input value={ownerAddress} onChange={(event) => setOwnerAddress(event.target.value)} placeholder="0x…" className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Spender address (optional, for Permit2)</span>
            <input value={spenderAddress} onChange={(event) => setSpenderAddress(event.target.value)} placeholder="0x…" className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs" />
          </label>
        </div>
        <button type="submit" disabled={busy || !connected} className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-50">
          {busy ? "Reading…" : "Read permit evidence"}
        </button>
      </form>

      <div aria-live="polite" className="sr-only">
        {busy ? "Permit read loading" : result ? `Permit read ${result.state}` : error ?? ""}
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p>}

      {result && (
        <section aria-label="Permit results" className="space-y-5 rounded-xl border border-white/10 p-5">
          <dl className="grid gap-3 sm:grid-cols-3 text-sm">
            <div><dt className="text-white/50">Chain ID</dt><dd>{result.chainId ?? "unavailable"}</dd></div>
            <div><dt className="text-white/50">Block</dt><dd>{result.blockNumber ?? "unavailable"}</dd></div>
            <div><dt className="text-white/50">Verifying contract</dt><dd className="font-mono text-xs">{result.tokenAddress}</dd></div>
          </dl>

          {result.warnings.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <div>
            <h2 className="text-sm font-medium">EIP-2612</h2>
            {result.eip2612?.supported ? (
              <dl className="mt-2 grid gap-3 sm:grid-cols-2 text-sm">
                <div><dt className="text-white/50">Name</dt><dd>{result.eip2612.name ?? "unavailable"}</dd></div>
                <div><dt className="text-white/50">Version</dt><dd>{result.eip2612.version ?? "unavailable"}</dd></div>
                <div><dt className="text-white/50">Domain separator</dt><dd className="font-mono text-xs">{result.eip2612.domainSeparator}</dd></div>
                <div><dt className="text-white/50">Owner nonce</dt><dd>{result.eip2612.nonce}</dd></div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-white/60">Not confirmed as EIP-2612 permit-capable from this evidence.</p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium">Permit2</h2>
            {result.permit2?.checked ? (
              result.permit2.amount !== null ? (
                <dl className="mt-2 grid gap-3 sm:grid-cols-3 text-sm">
                  <div><dt className="text-white/50">Recorded amount</dt><dd>{result.permit2.amount}</dd></div>
                  <div><dt className="text-white/50">Expiration</dt><dd>{result.permit2.expiration}</dd></div>
                  <div><dt className="text-white/50">Nonce</dt><dd>{result.permit2.nonce}</dd></div>
                </dl>
              ) : (
                <p className="mt-2 text-sm text-white/60">Permit2&apos;s allowance record could not be read.</p>
              )
            ) : (
              <p className="mt-2 text-sm text-white/60">Not checked — supply a spender address to look up Permit2.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
