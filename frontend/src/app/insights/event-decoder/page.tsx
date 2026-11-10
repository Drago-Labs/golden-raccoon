import { EventDecoderWorkbench } from "@/components/research/event-decoder/EventDecoderWorkbench";

export const dynamic = "force-dynamic";

export default function EventDecoderPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Soroban Spec-Aware Contract Event Decoder</h1>
        <p className="text-sm text-white/70">
          Fetch Soroban contract events and decode ScVal topics and data against the event definitions in the contract&apos;s own Wasm spec.
        </p>
      </header>
      <EventDecoderWorkbench />
    </main>
  );
}
