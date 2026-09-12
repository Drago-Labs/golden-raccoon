import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ReportComparison } from "@/components/research/report-comparison";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    baseId?: string;
    targetId?: string;
  }>;
};

/**
 * Next.js server page rendering the interactive snapshot report comparison workbench.
 */
export default async function ReportComparisonPage({ searchParams }: PageProps) {
  const { baseId, targetId } = await searchParams;

  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl px-4 py-12 text-center text-sm font-mono text-white/50">
            Initializing snapshot comparison workbench...
          </div>
        }
      >
        <ReportComparison initialBaseId={baseId} initialTargetId={targetId} />
      </Suspense>
    </AppShell>
  );
}
