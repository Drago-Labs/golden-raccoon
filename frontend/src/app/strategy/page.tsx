import { AppShell } from "@/components/AppShell";
import { StrategyClient } from "@/components/StrategyClient";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { BLOCKABLE_CATEGORIES, listStrategyPresets } from "@/server/rules/presets";
import { listSelectableChains } from "@/server/rules/strategyProfile";

export default function StrategyPage() {
  return (
    <AppShell>
      <StrategyClient
        initialRules={getDefaultRules()}
        presets={listStrategyPresets()}
        chains={listSelectableChains()}
        categories={[...BLOCKABLE_CATEGORIES]}
      />
    </AppShell>
  );
}
