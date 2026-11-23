import { BridgeLatency } from "@/components/research/bridge-latency/BridgeLatency";
export const dynamic = "force-dynamic";
export const metadata = { title: "Bridge latency", description: "Read-only latency and stuck transfers for a configured bridge." };
export default function BridgeLatencyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10">
      <header>
        <p className="text-xs uppercase tracking-[0.18em]">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Bridge latency</h1>
        <p className="max-w-3xl text-sm">Matches sends to deliveries by message id. Nothing is relayed.</p>
      </header>
      <BridgeLatency bridges={["cctp"]} />
    </main>
  );
}
