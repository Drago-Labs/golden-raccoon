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
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/insights/claimable-balances" className="inline-flex rounded-full border border-[#d9a441]/35 px-4 py-2 text-sm text-[#f2c86d]">Explore Stellar claimable balances</Link>
        <Link href="/insights/vesting-unlock" className="inline-flex rounded-full border border-[#d9a441]/35 px-4 py-2 text-sm text-[#f2c86d]">Vesting unlock workbench</Link>
      </div>
      <DashboardClient />
    </AppShell>
  );
}
