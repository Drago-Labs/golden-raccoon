import Link from "next/link";
import { PoolHistory } from "@/components/research/soroban-pool-history/PoolHistory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Soroban pool history",
  description: "Reconstruct constant-product AMM pool reserves from contract events and check them against storage.",
};

export default async function SorobanPoolHistoryPage({ searchParams }: { searchParams: Promise<{ network?: string }> }) {
  const params = await searchParams;
  const initialNetwork = params.network === "stellar-pubnet" ? "stellar-pubnet" : "stellar-testnet";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-subtle">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Soroban pool history</h1>
        <p className="max-w-3xl text-sm text-muted">
          Swap, deposit, withdraw, and sync events for a Soroban constant-product pool are applied in ledger order to
          rebuild reserves and implied price. The rebuilt end state is compared with current storage. Large
          price-moving trades link to their transactions. Unknown event layouts become an unsupported state. This page
          does not trade, route, or predict prices.
        </p>
        <p className="text-xs text-subtle">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </header>
      <PoolHistory initialNetwork={initialNetwork} />
    </main>
  );
}
