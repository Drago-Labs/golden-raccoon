import Link from "next/link";
import { InvocationProfile } from "@/components/research/invocation-profile/InvocationProfile";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Invocation Profile",
  description: "Profile who calls a Soroban contract, which functions they use, and how usage changes over time.",
};

export default async function InvocationProfilePage({
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
        <h1 className="text-3xl font-semibold">Invocation Profile</h1>
        <p className="max-w-3xl text-sm text-muted">
          Read invocations for a Soroban contract over a bounded ledger window, including calls made through other
          contracts. Aggregate by function, caller, and day with separate success and failure counts. Direct account
          callers are separated from contract intermediaries. Caller concentration and new versus returning cohorts are
          reported with a coverage notice. Identifying real-world operators is out of scope.
        </p>
        <p className="text-xs text-subtle">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </header>
      <InvocationProfile initialNetwork={initialNetwork} />
    </main>
  );
}
