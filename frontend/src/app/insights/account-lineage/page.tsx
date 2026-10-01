import { AccountLineageWorkspace } from "@/components/research/account-lineage/AccountLineageWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account lineage", description: "Who created a Stellar account and which accounts funded it." };

export default function AccountLineagePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold">Account lineage</h1>
      <p className="max-w-3xl text-sm text-muted">Creation hops and early funding. This does not identify people.</p>
      <AccountLineageWorkspace />
    </main>
  );
}
