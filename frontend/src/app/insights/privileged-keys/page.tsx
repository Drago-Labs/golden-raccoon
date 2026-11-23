import { PrivilegedKeyInventory } from "@/components/research/privileged-keys/PrivilegedKeyInventory";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Privileged key inventory",
  description: "Read-only inventory of keys that can change a project's contracts.",
};

const PROJECTS = [
  { id: "multisig-project", label: "Multisig project" },
  { id: "single-key-project", label: "Single-key project" },
];

export default function PrivilegedKeysPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-subtle">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Privileged keys</h1>
        <p className="max-w-3xl text-sm text-muted">
          Owners, admins, and upgrade authorities across the project's recorded deployments.
          Nothing here sends a transaction.
        </p>
      </header>
      <PrivilegedKeyInventory projects={PROJECTS} />
    </main>
  );
}
