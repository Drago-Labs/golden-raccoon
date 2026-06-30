import { Settings2, ShieldCheck } from "lucide-react";
import { RuleForm } from "@/components/RuleForm";
import type { UserRule } from "@/server/types";

const profiles = [
  {
    name: "Conservative",
    active: false,
  },
  {
    name: "Balanced",
    active: true,
  },
  {
    name: "Aggressive",
    active: false,
  },
];

export function StrategyClient({ initialRules }: { initialRules: UserRule }) {
  return (
    <div className="space-y-6">
      <section>
        <div className="text-sm uppercase tracking-[0.2em] text-[#d9a441]">Strategy</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Risk rules</h1>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {profiles.map((profile) => (
          <div
            key={profile.name}
            className={
              profile.active
                ? "rounded-[28px] border border-[#d9a441]/35 bg-[#d9a441]/10 p-6"
                : "glass-panel rounded-[28px] p-6"
            }
          >
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold">{profile.name}</div>
              {profile.active ? (
                <span className="rounded-full bg-[#d9a441] px-3 py-1 text-xs font-semibold text-black">Active</span>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <RuleForm initialRules={initialRules} />
        <div className="space-y-5">
          <div className="glass-panel rounded-[28px] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#d9a441]/12 p-3 text-[#d9a441]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Agent can prepare</h2>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {["Hold", "Reduce exposure", "Swap to USDC", "Watchlist"].map((action) => (
                <div key={action} className="flex items-center gap-3 rounded-2xl bg-white/6 p-4 text-sm text-white/68">
                  <ShieldCheck className="h-4 w-4 text-[#d9a441]" />
                  {action}
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-[28px] p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-white/8 p-3 text-white/70">
                <Settings2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Execution mode</h2>
                <div className="mt-1 text-sm text-white/45">Approval only</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
