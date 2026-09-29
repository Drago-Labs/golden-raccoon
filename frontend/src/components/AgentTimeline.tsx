import Link from "next/link";
import type { AgentStep } from "@/server/types";
import { Check, CircleDashed } from "lucide-react";

export function AgentTimeline({ steps }: { steps: AgentStep[] }) {
  return (
    <section className="glass-panel rounded-[28px] p-6">
      <h2 className="text-xl font-semibold">Agent timeline</h2>
      <div className="mt-6 space-y-4">
        {steps.map((step) => (
          <div key={step.key} className="flex gap-4">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 text-[#d9a441]">
              {step.status === "complete" ? <Check className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />}
            </div>
            <div>
              <div className="font-medium">{step.label}</div>
              <div className="mt-1 text-sm leading-6 text-white/52">{step.detail}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-white/54">
        <Link href="/insights/run-comparison" className="underline underline-offset-2 hover:text-white">
          Compare two saved runs side by side
        </Link>
      </p>
    </section>
  );
}
