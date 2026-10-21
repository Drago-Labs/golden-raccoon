"use client";

import { FormEvent, useState } from "react";
import type { PackageRegistryName } from "@/server/research/package-provenance/schema";

export function PackageInput(props: {
  defaultRegistry?: PackageRegistryName;
  defaultPackageName?: string;
  busy?: boolean;
  onSubmit: (registry: PackageRegistryName, packageName: string) => void;
}) {
  const [registry, setRegistry] = useState<PackageRegistryName>(props.defaultRegistry ?? "npm");
  const [packageName, setPackageName] = useState(props.defaultPackageName ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = packageName.trim();
    if (trimmed) props.onSubmit(registry, trimmed);
  }

  return (
    <form
      aria-label="Package provenance inspector package input"
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
      onSubmit={handleSubmit}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm sm:w-40">
          <span className="text-muted">Registry</span>
          <select
            name="registry"
            value={registry}
            onChange={(event) => setRegistry(event.target.value as PackageRegistryName)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
          >
            <option value="npm">npm</option>
            <option value="crates">crates.io</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="text-muted">Package name</span>
          <input
            name="packageName"
            type="text"
            required
            value={packageName}
            onChange={(event) => setPackageName(event.target.value)}
            placeholder={registry === "npm" ? "@stellar/stellar-sdk" : "soroban-sdk"}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
          />
        </label>
        <button
          type="submit"
          disabled={props.busy}
          className="self-start rounded-xl border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] outline-none transition hover:bg-[#d9a441]/15 focus-visible:ring-2 focus-visible:ring-[#d9a441]/60 disabled:opacity-50"
        >
          {props.busy ? "Inspecting…" : "Inspect package"}
        </button>
      </div>
    </form>
  );
}
