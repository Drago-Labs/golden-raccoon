import Link from "next/link";
import { ReserveAttestationWorkspace } from "@/components/research/reserve-attestation/ReserveAttestationWorkspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reserve attestation evidence workspace",
  description: "Review reserve-attestation reports against an explicit asset-plus-issuer registry.",
};

export default function ReserveAttestationPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">
        <Link href="/dashboard" className="underline underline-offset-2">Back to dashboard</Link>
      </p>
      <ReserveAttestationWorkspace />
    </main>
  );
}
