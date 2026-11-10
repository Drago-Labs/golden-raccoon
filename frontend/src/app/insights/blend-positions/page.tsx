import { LendingPositionWorkbench } from "@/components/research/blend-positions/LendingPositionWorkbench";

export const dynamic = "force-dynamic";

export default function BlendPositionsPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Blend Pool Positions & Liquidation Distance</h1>
        <p className="text-sm text-white/70">
          Explain supply and borrow positions, collateral and liability factors, health factor, and liquidation price distance on Soroban Blend pools.
        </p>
      </header>
      <LendingPositionWorkbench />
    </main>
  );
}
