import { CorrelationWorkbench } from "@/components/research/holding-correlation/CorrelationWorkbench";

export const dynamic = "force-dynamic";

export default function HoldingCorrelationPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Holding Return Correlation</h1>
        <p className="text-sm text-white/70">
          Measure pairwise Pearson and Spearman return correlation across wallet holdings over a stated window.
        </p>
      </header>
      <CorrelationWorkbench />
    </main>
  );
}
