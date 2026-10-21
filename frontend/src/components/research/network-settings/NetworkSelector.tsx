"use client";

import { NETWORKS, NETWORK_IDS, type NetworkId } from "@/server/research/network-settings/networkIdentity";

export function NetworkSelector(props: {
  network: NetworkId;
  disabled?: boolean;
  onChange: (network: NetworkId) => void;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-2 text-sm" htmlFor="network-settings-network">
      <span className="font-medium">Network</span>
      <select
        id="network-settings-network"
        className="w-full max-w-full rounded-xl border border-foreground/20 bg-background px-3 py-2 text-base text-foreground"
        value={props.network}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value as NetworkId)}
      >
        {NETWORK_IDS.map((id) => (
          <option key={id} value={id}>
            {NETWORKS[id].label}
          </option>
        ))}
      </select>
    </label>
  );
}
