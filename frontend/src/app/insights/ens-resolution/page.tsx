import { EnsVerifier } from "@/components/research/ens-resolution/EnsVerifier";

export const dynamic = "force-dynamic";

export default function EnsResolutionPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">ENS Forward & Reverse Resolution Verifier</h1>
        <p className="text-sm text-white/70">
          Verify bidirectional ENS resolution, resolver ownership, expiry, and Unicode confusable labels.
        </p>
      </header>
      <EnsVerifier />
    </main>
  );
}
