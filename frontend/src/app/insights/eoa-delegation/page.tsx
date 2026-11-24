import Link from "next/link";
import { DelegationInspector } from "@/components/research/eoa-delegation/DelegationInspector";
export const dynamic = "force-dynamic";
export const metadata = { title: "EIP-7702 delegation inspector", description: "Explain delegation code installed on an externally owned account." };
export default function Page() { return <main className="mx-auto min-h-screen max-w-6xl space-y-8 px-4 py-10"><Link href="/dashboard" className="text-sm underline">Back to dashboard</Link><DelegationInspector /></main>; }
