import Link from "next/link";
import { ClaimVerifier } from "@/components/research/merkle-claims/ClaimVerifier";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Merkle distributor claim verification",
  description: "Check an address's claim against a published tree, the on-chain root, and the claimed bitmap.",
};

export default function MerkleClaimsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">
        <Link href="/dashboard" className="underline underline-offset-2">
          Back to dashboard
        </Link>
      </p>
      <ClaimVerifier />
    </main>
  );
}
