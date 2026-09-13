import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { DashboardClient } from "@/components/DashboardClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard - Portfolio & Stress Testing",
  description: "View your portfolio, run agent analysis, and perform stress testing.",
};

export default function DashboardPage() {
  return (
    <AppShell>
      <Link href="/insights/claimable-balances" className="mb-4 inline-flex rounded-full border border-[#d9a441]/35 px-4 py-2 text-sm text-[#f2c86d]">Explore Stellar claimable balances</Link>
      <DashboardClient />
    </AppShell>
  );
}
