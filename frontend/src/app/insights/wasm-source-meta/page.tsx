import Link from "next/link";
import { WasmMetaReport } from "@/components/research/wasm-source-meta/WasmMetaReport";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wasm Source Metadata",
  description: "Compare deployed Soroban Wasm custom-section metadata with published source references.",
};

export default async function WasmSourceMetaPage({
  searchParams,
}: {
  searchParams: Promise<{ network?: string }>;
}) {
  const params = await searchParams;
  const initialNetwork = params.network === "stellar-pubnet" ? "stellar-pubnet" : "stellar-testnet";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-subtle">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Wasm Source Metadata</h1>
        <p className="max-w-3xl text-sm text-muted">
          Reads a contract&apos;s Wasm custom sections (`contractmetav0`, `contractenvmetav0`, `contractspecv0`) and
          compares repository, commit, and SDK fields with project-published references. Absent metadata is reported as
          absent, not as a mismatch. Building contracts from source is out of scope.
        </p>
        <p className="text-xs text-subtle">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </header>
      <WasmMetaReport initialNetwork={initialNetwork} />
    </main>
  );
}
