import Link from "next/link";
import { NftMetadataInspector } from "@/components/research/nft-metadata/NftMetadataInspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "NFT metadata hosting & mutability",
  description: "Check where a collection's metadata and media are hosted, whether sampled tokens resolve, and whether the contract can change them.",
};

export default function NftMetadataPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">
        <Link href="/dashboard" className="underline underline-offset-2">
          Back to dashboard
        </Link>
      </p>
      <NftMetadataInspector />
    </main>
  );
}
