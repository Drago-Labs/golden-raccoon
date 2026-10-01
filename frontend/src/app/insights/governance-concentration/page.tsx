import { GovernanceWorkspace } from "@/components/research/governance-concentration/GovernanceWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "DAO voting concentration", description: "Proposal outcomes and voting-power concentration." };

export default function GovernanceConcentrationPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold">DAO voting concentration</h1>
      <p className="max-w-3xl text-sm text-muted">Read-only proposal outcomes, quorum margin, and how concentrated the decisive votes were.</p>
      <GovernanceWorkspace />
    </main>
  );
}
