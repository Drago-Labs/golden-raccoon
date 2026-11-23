import { TreasuryTracker } from "@/components/research/treasury-flows/TreasuryTracker";
export const dynamic = "force-dynamic";
export const metadata = { title: "Treasury flows", description: "Read-only treasury balances and categorized outflows." };
export default function TreasuryFlowsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10">
      <header>
        <p className="text-xs uppercase tracking-[0.18em]">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Treasury flows</h1>
        <p className="max-w-3xl text-sm">Rebuilds declared treasury checkpoints and labels outflows only when a source already did.</p>
      </header>
      <TreasuryTracker projects={["active-treasury"]} />
    </main>
  );
}
