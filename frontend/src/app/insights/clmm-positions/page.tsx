import Link from "next/link";
import { PositionExplainer } from "@/components/research/clmm-positions/PositionExplainer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CLMM positions",
  description: "Explain concentrated-liquidity position ranges, in-range status, and uncollected fees.",
};

export default async function ClmmPositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ network?: string }>;
}) {
  const params = await searchParams;
  const initialNetwork =
    params.network === "base" || params.network === "arbitrum" ? params.network : "ethereum";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-subtle">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Concentrated liquidity positions</h1>
        <p className="max-w-3xl text-sm text-muted">
          Decode Uniswap v3-style position NFTs for an address: tick range, in-range status, current token amounts,
          and uncollected fees. Closed and zero-liquidity positions stay visible but are excluded from open totals.
          Collecting or rebalancing is out of scope.
        </p>
        <p className="text-xs text-subtle">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </header>
      <PositionExplainer initialNetwork={initialNetwork} />
    </main>
  );
}
