import { Bot, Newspaper, RadioTower, ShieldCheck, Wallet } from "lucide-react";

const modules = [
  { name: "Portfolio", icon: Wallet },
  { name: "News", icon: Newspaper },
  { name: "Social", icon: RadioTower },
  { name: "Onchain", icon: ShieldCheck },
  { name: "Execution", icon: Bot },
];

const flow = ["Scan", "Score", "Recommend", "Approve"];

export function AgentsNetwork() {
  return (
    <div className="space-y-6">
      <section>
        <div className="text-sm uppercase tracking-[0.2em] text-[#d9a441]">Agents</div>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Agent modules</h1>
      </section>

      <section className="glass-panel rounded-[28px] p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {modules.map((module) => {
            const Icon = module.icon;

            return (
              <div key={module.name} className="rounded-[22px] border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#d9a441]/10 text-[#d9a441]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                </div>
                <div className="mt-5 text-lg font-semibold">{module.name}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-[28px] border border-[#d9a441]/20 bg-[#d9a441]/8 p-6">
          <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Current flow</div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4 lg:grid-cols-2">
            {flow.map((step, index) => (
              <div key={step} className="rounded-2xl bg-black/20 p-4">
                <div className="text-sm text-white/38">0{index + 1}</div>
                <div className="mt-2 text-lg font-semibold">{step}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[28px] p-6">
          <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Recommendation</div>
          <h2 className="mt-3 text-3xl font-semibold">Approval required before execution</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {["Risk checked", "Rules matched", "Transaction prepared"].map((item) => (
              <div key={item} className="rounded-2xl bg-white/6 p-4 text-sm text-white/62">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
