import { AppShell } from "@/components/AppShell";
import { DelegateParticipation } from "@/components/research/delegate-participation/DelegateParticipation";

export const metadata = { title: "Delegate participation | Golden Raccoon" };

export default function Page() {
  return (
    <AppShell>
      <DelegateParticipation />
    </AppShell>
  );
}
