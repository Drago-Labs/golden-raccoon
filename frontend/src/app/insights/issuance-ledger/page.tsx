import Link from "next/link";
import { IssuanceLedger } from "@/components/research/issuance-ledger/IssuanceLedger";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Issuance ledger",
  description: "Rebuild issued-asset supply from issuer mint and burn operations and reconcile with network supply.",
};

export default async function IssuanceLedgerPage({ searchParams }: { searchParams: Promise<{ network?: string }> }) {
  const params = await searchParams;
  const initialNetwork = params.network === "stellar-pubnet" ? "stellar-pubnet" : "stellar-testnet";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-subtle">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Issuance ledger</h1>
        <p className="max-w-3xl text-sm text-muted">
          Issuer payments, path payments, claimable-balance creation, and clawbacks that touch an issued asset are
          classified as mint, burn, or neutral. Running supply is rebuilt in stroops and compared with the
          network-reported amount at checkpoints. A gap lists the surrounding operations and is never called a match.
          This page does not assert that an issuer acted improperly.
        </p>
        <p className="text-xs text-subtle">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </header>
      <IssuanceLedger initialNetwork={initialNetwork} />
    </main>
  );
}
