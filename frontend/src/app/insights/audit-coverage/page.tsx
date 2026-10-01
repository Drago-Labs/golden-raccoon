import { AuditCoverageWorkspace } from "@/components/research/audit-coverage/AuditCoverageWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit coverage", description: "Which deployed contracts an audit actually covered." };

export default function AuditCoveragePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold">Audit coverage</h1>
      <p className="max-w-3xl text-sm text-muted">Published audit scope matched to deployed code hashes and commits.</p>
      <AuditCoverageWorkspace />
    </main>
  );
}
