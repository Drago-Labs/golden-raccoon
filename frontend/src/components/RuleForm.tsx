"use client";

import { useState } from "react";
import type { UserRule } from "@/server/types";

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
    <section className="glass-panel rounded-lg p-6">
      <h2 className="text-xl font-semibold">Limits</h2>
      <div className="mt-6 grid gap-6">
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
        Save
      </button>
      {saved ? <span className="ml-4 text-sm text-emerald-300">Saved</span> : null}
    </section>
  );
}
