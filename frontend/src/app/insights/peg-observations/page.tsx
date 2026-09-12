import Link from "next/link";
import { Suspense } from "react";
import { PegWorkspace } from "@/components/research/peg-observations";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Stable-Asset Peg Deviation Analysis | Golden Raccoon",
  description:
    "Analyze bounded historical stable-asset peg deviations, identify continuity gaps, and evaluate non-unit target benchmarks across chains.",
};

interface PegObservationsPageProps {
  searchParams: Promise<{
    fixture?: string;
  }>;
}

/**
 * Insights page for stable-asset peg deviation analysis.
 */
export default async function PegObservationsPage({ searchParams }: PegObservationsPageProps) {
  const resolvedParams = await searchParams;

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex items-center space-x-2 text-xs text-zinc-400">
            <li>
              <Link href="/" className="transition hover:text-zinc-200">
                Dashboard
              </Link>
            </li>
            <li>
              <span className="text-zinc-600">/</span>
            </li>
            <li>
              <span className="font-medium text-zinc-300" aria-current="page">
                Peg Deviation Analysis
              </span>
            </li>
          </ol>
        </nav>

        <Suspense
          fallback={
            <div className="flex h-96 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/40">
              <div className="text-center text-xs text-zinc-400">Loading Peg Analysis Workspace...</div>
            </div>
          }
        >
          <PegWorkspace initialFixture={resolvedParams?.fixture} />
        </Suspense>
      </div>
    </div>
  );
}
