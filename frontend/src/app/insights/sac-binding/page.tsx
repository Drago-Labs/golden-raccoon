import { SacVerifier } from "@/components/research/sac-binding/SacVerifier";

export const dynamic = "force-dynamic";

export default function SacBindingPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Stellar Asset Contract (SAC) Binding Verifier</h1>
        <p className="text-sm text-white/70">
          Verify whether a Soroban contract ID is the genuine deterministic Stellar Asset Contract for a classic Stellar asset or a look-alike Wasm token.
        </p>
      </header>
      <SacVerifier />
    </main>
  );
}
