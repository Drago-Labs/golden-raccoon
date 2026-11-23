"use client";

import { useMemo } from "react";
import { listAssets } from "@/server/research/stablecoin-flows/assetRegistry";

/** Picks one configured stablecoin and, optionally, a subset of its chains. */
export function AssetSelector({
  assetId,
  chains,
  busy,
  onAssetChange,
  onChainsChange,
}: {
  assetId: string;
  chains: string[];
  busy: boolean;
  onAssetChange: (assetId: string) => void;
  onChainsChange: (chains: string[]) => void;
}) {
  const assets = useMemo(() => listAssets(), []);
  const asset = assets.find((candidate) => candidate.id === assetId) ?? assets[0];

  return (
    <div className="space-y-3">
      <label className="flex flex-col gap-1">
        Stablecoin
        <select
          value={asset.id}
          disabled={busy}
          onChange={(event) => {
            onAssetChange(event.target.value);
            onChainsChange([]);
          }}
          className="min-h-11 rounded border bg-background p-2"
        >
          {assets.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.symbol} — {candidate.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-3 rounded border p-3">
        <legend className="px-1">Chains (none selected reads every configured chain)</legend>
        {asset.chains.map((chain) => (
          <label key={chain} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={chains.includes(chain)}
              disabled={busy}
              onChange={(event) =>
                onChainsChange(
                  event.target.checked ? [...chains, chain] : chains.filter((candidate) => candidate !== chain),
                )
              }
            />
            {chain}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
