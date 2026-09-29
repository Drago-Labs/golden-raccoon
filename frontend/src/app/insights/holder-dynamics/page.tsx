import { AppShell } from "@/components/AppShell";
import { HolderDynamicsWorkspace } from "@/components/research/holder-dynamics/HolderDynamicsWorkspace";
export const metadata = { title: "Holder dynamics | Golden Raccoon" };
export default function Page() {
  return <AppShell><HolderDynamicsWorkspace /></AppShell>;
}
