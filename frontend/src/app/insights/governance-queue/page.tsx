import { AppShell } from "@/components/AppShell";
import { GovernanceQueueWorkspace } from "@/components/research/governance-queue/GovernanceQueueWorkspace";

export const metadata = { title: "Governance queue | Golden Raccoon" };

export default function Page() {
  return (
    <AppShell>
      <GovernanceQueueWorkspace />
    </AppShell>
  );
}
