import { AppShell } from "@/components/AppShell";
import { StablecoinFlows } from "@/components/research/stablecoin-flows/StablecoinFlows";

export const metadata = { title: "Stablecoin flows | Golden Raccoon" };

export default function Page() {
  return (
    <AppShell>
      <StablecoinFlows />
    </AppShell>
  );
}
