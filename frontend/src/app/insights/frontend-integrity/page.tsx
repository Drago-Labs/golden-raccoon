import { FrontendIntegrity } from "@/components/research/frontend-integrity/FrontendIntegrity";
export const dynamic = "force-dynamic";
export const metadata = { title: "Frontend integrity", description: "Read-only record of a dApp page's scripts and security headers." };
export default function FrontendIntegrityPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10">
      <header>
        <p className="text-xs uppercase tracking-[0.18em]">Golden Raccoon · Insights</p>
        <h1 className="text-3xl font-semibold">Frontend integrity</h1>
        <p className="max-w-3xl text-sm">Records script hashes and security headers. Page scripts are never executed.</p>
      </header>
      <FrontendIntegrity />
    </main>
  );
}
