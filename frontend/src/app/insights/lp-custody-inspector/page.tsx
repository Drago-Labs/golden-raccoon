import Link from "next/link";
import { LpCustodyInspector } from "@/components/research/lp-custody-inspector/LpCustodyInspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "LP token custody inspector",
  description: "Connect pools to LP token owners, burns, and time-bound lock evidence.",
};

export default function LpCustodyInspectorPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">
        <Link href="/dashboard" className="underline underline-offset-2">Back to dashboard</Link>
      </p>
      <LpCustodyInspector />
    </main>
  );
}
