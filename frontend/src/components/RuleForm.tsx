"use client";

import { useState } from "react";
import type { UserRule } from "@/server/types";
import { ShieldCheck } from "lucide-react";

export function RuleForm({ initialRules }: { initialRules: UserRule }) {
  const [rules, setRules] = useState(initialRules);
  const [saved, setSaved] = useState(false);

  async function saveRules() {
    setSaved(false);
    const response = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });

    if (response.ok) {
      setSaved(true);
    }
  }

  return (
    <section className="glass-panel rounded-[28px] p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-[#d9a441]/12 p-3 text-[#d9a441]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold">Risk tolerance</h2>
        </div>
      </div>
      <div className="mt-8 grid gap-5">
        {[
          ["maxRiskScore", "Max risk"],
          ["maxTradePercent", "Max trade"],
          ["maxMemeExposurePercent", "Meme cap"],
        ].map(([key, label]) => (
          <label key={key} className="block">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-white/64">{label}</span>
              <span className="font-medium text-[#d9a441]">{rules[key as keyof UserRule] as number}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={rules[key as keyof UserRule] as number}
              onChange={(event) =>
                setRules((current) => ({ ...current, [key]: Number(event.target.value) }))
              }
              className="w-full accent-[#d9a441]"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={saveRules}
        className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-[#d9a441] px-6 text-sm font-semibold text-black transition hover:bg-[#f2c86d]"
      >
        Save Rules
      </button>
      {saved ? <span className="ml-4 text-sm text-emerald-300">Rules saved for demo session.</span> : null}
    </section>
  );
}
