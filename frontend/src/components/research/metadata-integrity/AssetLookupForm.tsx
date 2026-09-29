"use client";

import { FormEvent, useState } from "react";
import type { StellarNetworkShort } from "@/server/research/metadata-integrity/schema";

export type AssetLookupSubmission = {
  assetCode: string;
  issuer: string;
  network: StellarNetworkShort;
  homeDomain: string;
};

/**
 * Read-only lookup form for a classic Stellar asset identity.
 *
 * Network is required so testnet and pubnet records stay distinct even when
 * the symbol and issuer string collide across environments.
 */
export function AssetLookupForm(props: {
  defaults?: Partial<AssetLookupSubmission>;
  busy?: boolean;
  onSubmit: (value: AssetLookupSubmission) => void;
}) {
  const [assetCode, setAssetCode] = useState(props.defaults?.assetCode ?? "");
  const [issuer, setIssuer] = useState(props.defaults?.issuer ?? "");
  const [network, setNetwork] = useState<StellarNetworkShort>(props.defaults?.network ?? "pubnet");
  const [homeDomain, setHomeDomain] = useState(props.defaults?.homeDomain ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit({
      assetCode: assetCode.trim(),
      issuer: issuer.trim(),
      network,
      homeDomain: homeDomain.trim(),
    });
  }

  return (
    <form
      aria-label="Metadata integrity lookup"
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
      onSubmit={handleSubmit}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Asset code</span>
          <input
            name="assetCode"
            value={assetCode}
            onChange={(event) => setAssetCode(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            required
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
            placeholder="USDC"
          />
        </label>

        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="metadata-network" className="text-muted">
            Network
          </label>
          <select
            id="metadata-network"
            name="network"
            value={network}
            onChange={(event) => setNetwork(event.target.value as StellarNetworkShort)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
            aria-describedby="network-help"
          >
            <option value="pubnet">Pubnet</option>
            <option value="testnet">Testnet</option>
          </select>
          <span id="network-help" className="text-xs text-subtle">
            Testnet and pubnet identities stay separate even when the code and issuer match.
          </span>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Issuer account</span>
        <input
          name="issuer"
          value={issuer}
          onChange={(event) => setIssuer(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60 sm:text-sm"
          placeholder="G..."
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Home domain override (optional)</span>
        <input
          name="homeDomain"
          value={homeDomain}
          onChange={(event) => setHomeDomain(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
          placeholder="example.com"
          aria-describedby="home-domain-help"
        />
        <span id="home-domain-help" className="text-xs text-subtle">
          Used only when the issuer account has no home_domain. A TOML file still does not prove domain ownership.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={props.busy}
          className="rounded-full border border-[#d9a441]/40 bg-[#d9a441]/15 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          {props.busy ? "Inspecting…" : "Inspect metadata"}
        </button>
        <p className="text-xs text-subtle">Read-only. No metadata is edited and no legitimacy verdict is produced.</p>
      </div>
    </form>
  );
}
