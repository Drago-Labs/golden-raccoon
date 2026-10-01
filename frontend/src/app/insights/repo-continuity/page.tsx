import { RepoContinuityWorkspace } from "@/components/research/repo-continuity/RepoContinuityWorkspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Repository continuity", description: "Release cadence, commit activity, and maintainer continuity." };

export default function RepoContinuityPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10">
      <h1 className="text-3xl font-semibold">Repository continuity</h1>
      <p className="max-w-3xl text-sm text-muted">Public repository activity, maintainer turnover, and archived or transferred state.</p>
      <RepoContinuityWorkspace />
    </main>
  );
}
