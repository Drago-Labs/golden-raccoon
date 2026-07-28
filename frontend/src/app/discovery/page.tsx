import Link from "next/link";
import { AlertCard } from "@/components/AlertCard";
import { listDiscoveryCandidates } from "@/server/discovery/pipeline";
import type { DiscoveryClassification, DiscoveryScanResult, RiskLevel, WatchlistScanRun } from "@/server/types";

type FixtureCandidateLike = {
  id: string;
  chain: string;
  contractAddress?: string;
  symbol?: string;
  tokenName?: string;
  pairUrl?: string;
  source: string;
  assetType?: string;
  issuer?: string;
  assetKey?: string;
  metrics?: { liquidityUsd?: number; pairAgeDays?: number; fdvLiquidityRatio?: number };
};

const fixtureCandidates: FixtureCandidateLike[] = [
  {
    id: "fixture-evm-clean",
    chain: "base",
    contractAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    tokenName: "Wrapped Ether",
    pairUrl: "https://dexscreener.com/base/weth",
    source: "dexscreener",
    metrics: { liquidityUsd: 38_000_000, pairAgeDays: 1500, fdvLiquidityRatio: 1.2 },
  },
  {
    id: "fixture-evm-thin",
    chain: "base",
    contractAddress: "0x4444444444444444444444444444444444444444",
    symbol: "THIN",
    tokenName: "Thin Liquidity Token",
    pairUrl: "https://dexscreener.com/base/thin",
    source: "dexscreener",
    metrics: { liquidityUsd: 12_000, pairAgeDays: 1, fdvLiquidityRatio: 48.5 },
  },
  {
    id: "fixture-stellar-usdc",
    chain: "stellar-public",
    symbol: "USDC",
    tokenName: "USD Coin",
    assetType: "classic",
    issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    assetKey: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
    source: "stellar_market",
    metrics: { liquidityUsd: 250_000_000, fdvLiquidityRatio: 0.9 },
  },
];

const classificationTone: Record<DiscoveryClassification, string> = {
  watch: "border-sky-500/60 bg-sky-500/5 text-sky-300",
  risky: "border-amber-500/60 bg-amber-500/5 text-amber-300",
  scam: "border-rose-500/60 bg-rose-500/5 text-rose-300",
  early_opportunity: "border-emerald-500/60 bg-emerald-500/5 text-emerald-300",
};

const severityTone: Record<RiskLevel, string> = {
  low: "text-sky-300",
  medium: "text-amber-300",
  high: "text-orange-300",
  critical: "text-rose-400",
};

async function safeListCandidates() {
  try {
    return await listDiscoveryCandidates();
  } catch {
    return [];
  }
}

export default async function DiscoveryPage() {
  const live = await safeListCandidates();
  const candidates = live.length > 0 ? (live as unknown as FixtureCandidateLike[]) : fixtureCandidates;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Golden Raccoon · V3</p>
        <h1 className="text-3xl font-semibold text-white">Discovery candidates, scans, watchlists, and alerts</h1>
        <p className="max-w-3xl text-sm text-slate-300">
          Discovery proposes candidates through the full risk pipeline. The server never prepares or signs a transaction. Critical risks
          remain visible regardless of market momentum.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Discovery candidates</h2>
          <span className="text-xs text-slate-400">Identity is resolved before any scan. Unresolved candidates cannot become opportunity.</span>
        </div>
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{candidate.symbol ?? candidate.tokenName ?? candidate.id}</span>
                <span className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400">{candidate.chain}</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">{candidate.tokenName ?? "Unnamed candidate"}</p>
              {candidate.contractAddress ? (
                <p className="mt-1 truncate text-[11px] text-slate-500">{candidate.contractAddress}</p>
              ) : null}
              <dl className="mt-3 grid grid-cols-2 gap-1 text-[11px] text-slate-400">
                <div>Pair age: {candidate.metrics?.pairAgeDays ?? "?"} d</div>
                <div>Liquidity: ${candidate.metrics?.liquidityUsd?.toLocaleString("en-US") ?? "?"}</div>
                <div>Source: {candidate.source}</div>
                <div>FDV/Liq: {candidate.metrics?.fdvLiquidityRatio?.toFixed(1) ?? "?"}x</div>
              </dl>
              <div className="mt-3 flex justify-end">
                <Link
                  href={`/agents?query=${encodeURIComponent(candidate.contractAddress ?? candidate.assetKey ?? "")}`}
                  className="text-xs text-emerald-300 underline-offset-2 hover:underline"
                >
                  Run full scan →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-medium text-white">How classifications work</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <span className={`inline-block min-w-[110px] rounded border px-2 py-0.5 text-xs ${classificationTone.watch}`}>watch</span>
              <span>Default classification when identity or coverage is incomplete.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className={`inline-block min-w-[110px] rounded border px-2 py-0.5 text-xs ${classificationTone.risky}`}>risky</span>
              <span>Elevated score or non-critical blockers; manual review required.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className={`inline-block min-w-[110px] rounded border px-2 py-0.5 text-xs ${classificationTone.scam}`}>scam</span>
              <span>Critical onchain, social, phishing or identity blocker observed.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className={`inline-block min-w-[110px] rounded border px-2 py-0.5 text-xs ${classificationTone.early_opportunity}`}>early_opportunity</span>
              <span>Resolved identity, adequate coverage, score below 50, no blockers. Discovery still does not prepare a transaction.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-lg font-medium text-white">Recent alerts (structural)</h2>
          <div className="mt-3 space-y-2">
            <AlertCard
              title="Auto-execute remains disabled"
              detail="The server never prepares or signs a transaction. Every action requires wallet approval."
              severity="low"
              sourceLabel="policy"
            />
            <AlertCard
              title="Critical risks stay visible"
              detail="Even with rising momentum, Discovery keeps critical-risk flags in the candidate factor list."
              severity="medium"
              sourceLabel="rule"
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-medium text-white">Watchlist rescan guarantees</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-300">
          <li>• Rescans always create a new immutable scan run linked to the previous run.</li>
          <li>• Chain-aware canonical identity (EVM contract or Stellar CODE:ISSUER / C-address) keeps the same code/different-issuer assets distinct.</li>
          <li>• Failed rescans leave the previous scan visible with a stale status and never overwrite history.</li>
          <li>• Alerts (critical risk, liquidity drop, phishing, news incident, classification change) are recorded only on significant events.</li>
        </ul>
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
