import { TimelockInspector } from "@/components/research/evm-timelock/TimelockInspector";

export const dynamic = "force-dynamic";

export default function EvmTimelockPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">EVM TimelockController Inspector</h1>
        <p className="text-sm text-white/70">
          Inspect scheduled, ready, executed, and cancelled timelock operations, decoded calls, and role holders.
        </p>
      </header>
      <TimelockInspector />
    </main>
  );
}
