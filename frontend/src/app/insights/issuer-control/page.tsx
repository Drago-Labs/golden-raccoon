import { AppShell } from "@/components/AppShell";
import { IssuerControlInspector } from "@/components/research/issuer-control/IssuerControlInspector";

export const metadata = { title: "Issuer control inspector | Golden Raccoon" };

export default function Page() {
  return (
    <AppShell>
      <IssuerControlInspector />
    </AppShell>
  );
}
