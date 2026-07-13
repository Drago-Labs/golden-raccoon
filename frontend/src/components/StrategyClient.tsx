import { RuleForm } from "@/components/RuleForm";
import type { UserRule } from "@/server/types";

export function StrategyClient({ initialRules }: { initialRules: UserRule }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="flex items-end justify-between gap-4 border-b border-white/10 pb-4">
        <h1 className="text-3xl font-semibold tracking-tight">Risk rules</h1>
        <span className="text-sm text-white/46">Wallet approval required</span>
      </section>
      <RuleForm initialRules={initialRules} />
    </div>
  );
}
