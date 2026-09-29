import { AppShell } from "@/components/AppShell";
import { AccountSignersWorkbench } from "@/components/research/account-signers/AccountSignersWorkbench";

export const metadata = { title: "Account signer thresholds | Golden Raccoon" };

export default function Page() {
  return (
    <AppShell>
      <AccountSignersWorkbench />
    </AppShell>
  );
}
