import Link from "next/link";
import { PermitInspector } from "@/components/research/permit-inspector/PermitInspector";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Permit & domain inspector",
  description: "Inspect EIP-2612 permit capability and Permit2 exposure without signing.",
};

export default function PermitInspectorPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">
        <Link href="/dashboard" className="underline underline-offset-2">Back to dashboard</Link>
      </p>
      <PermitInspector />
    </main>
  );
}
