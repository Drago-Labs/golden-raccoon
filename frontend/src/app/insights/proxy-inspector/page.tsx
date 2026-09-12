import Link from "next/link";
import { ProxyInspector } from "@/components/research/proxy-inspector/ProxyInspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Proxy implementation inspector",
  description: "Read which implementation a contract delegates to, and what upgrade authority is actually observable.",
};

export default async function ProxyInspectorPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; network?: string; address?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-subtle">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Proxy implementation inspector</h1>
        <p className="max-w-3xl text-sm text-muted">
          A token address is often not where the code lives. This inspector reads the standardized ERC-1967 slots at one
          identified block, follows supported direct and beacon indirection with a published depth and read bound, and shows
          the raw word behind every conclusion. It reports authority it can observe and refuses to infer the rest: an empty
          admin slot is reported as authority not observed, never as an immutable contract. It performs reads only — it cannot
          upgrade anything, change an admin, submit a transaction or alter an existing risk score.
        </p>
        <p className="text-xs text-subtle">
          <Link href="/dashboard" className="underline underline-offset-2">
            Back to dashboard
          </Link>
        </p>
      </header>

      <ProxyInspector account={params.account ?? null} network={params.network ?? null} address={params.address ?? null} />
    </main>
  );
}
