import { ResourceHeadroomWorkbench } from "@/components/research/resource-headroom/ResourceHeadroomWorkbench";

export const dynamic = "force-dynamic";

export default function ResourceHeadroomPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Soroban Invocation Resource Headroom</h1>
        <p className="text-sm text-white/70">
          Compare simulated or historical Soroban invocation CPU, memory, ledger read/write, and transaction size usage against network limits.
        </p>
      </header>
      <ResourceHeadroomWorkbench />
    </main>
  );
}
