import Link from "next/link";
import { PoolReturnsReport } from "@/components/research/pool-share-returns/PoolReturnsReport";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pool Share Returns",
  description: "Compare liquidity-pool fee income with divergence loss for a share position.",
};

export default async function PoolShareReturnsPage({ searchParams }: { searchParams: Promise<{ network?: string }> }) {
  const params = await searchParams;
  const initialNetwork = params.network === "stellar-pubnet" ? "stellar-pubnet" : "stellar-testnet";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-subtle">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Pool Share Returns</h1>
        <p className="max-w-3xl text-sm text-muted">
          This page breaks down a liquidity-pool share position over a chosen window, separating fee income from
          divergence loss against simply holding the two assets. Reserve snapshots, share supply, and trade history are
          read from existing providers. Hold value, pool value, fee income, and divergence loss are computed with
          decimal-safe arithmetic. Missing reserves or prices are shown as gaps, never interpolated. Prices, tax, and
          transaction building are out of scope.
        </p>
        <p className="text-xs text-subtle">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </header>
      <PoolReturnsReport initialNetwork={initialNetwork} />
    </main>
  );
}
