import { AppShell } from "@/components/AppShell";
import { AttributionReport } from "@/components/research/performance-attribution/AttributionReport";

export const metadata = { title: "Performance attribution | Golden Raccoon" };

export default function Page() {
  return (
    <AppShell>
      <AttributionReport />
    </AppShell>
  );
}
