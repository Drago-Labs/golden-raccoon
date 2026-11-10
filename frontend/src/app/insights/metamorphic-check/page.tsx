import { MetamorphicCheck } from "@/components/research/metamorphic-check/MetamorphicCheck";

export const dynamic = "force-dynamic";

export default function MetamorphicCheckPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Metamorphic & Redeployable Contract Check</h1>
        <p className="text-sm text-white/70">
          Identify CREATE2 + SELFDESTRUCT and dynamic init-code redeployability patterns with EIP-6780 fork awareness.
        </p>
      </header>
      <MetamorphicCheck />
    </main>
  );
}
