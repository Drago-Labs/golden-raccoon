import { AutoModeOnboarding } from "@/components/AutoModeOnboarding";
import { RuleForm } from "@/components/RuleForm";
import type { UserRule } from "@/server/types";

export function StrategyClient({ initialRules }: { initialRules: UserRule }) {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d9a441]">Strategy</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Risk rules and auto mode</h1>
        </div>
        <span className="text-sm text-white/46">Wallet authorization required</span>
      </section>
      <RuleForm initialRules={initialRules} />
      <AutoModeOnboarding />
    </div>
  );
}
