import { CallTreeWorkbench } from "@/components/research/call-tree/CallTreeWorkbench";

export const dynamic = "force-dynamic";

export default function CallTreePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Cross-Contract Call Tree Tracer</h1>
        <p className="text-sm text-white/70">
          Reconstruct nested Soroban contract invocations, decoded arguments, inner failure locations, and net token movements from diagnostic events.
        </p>
      </header>
      <CallTreeWorkbench />
    </main>
  );
}
