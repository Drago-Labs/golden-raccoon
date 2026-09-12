"use client";

import React, { useState } from "react";
import {
  type CanonicalAssetId,
  type PegDefinition,
} from "@/server/research/peg-observations";

export interface AssetReferenceFormValues {
  assetId: CanonicalAssetId;
  fixture?: string;
  thresholdBps: number;
  gapToleranceMinutes: number;
  customDefinition?: Partial<PegDefinition>;
}

interface AssetReferenceFormProps {
  initialValues: AssetReferenceFormValues;
  onSubmit: (values: AssetReferenceFormValues) => void;
  isLoading: boolean;
  className?: string;
}

const PRESET_OPTIONS = [
  {
    id: "usdc-eth",
    label: "USDC (Ethereum Native) — Target: 1.00 USD",
    assetId: {
      chainFamily: "evm" as const,
      network: "ethereum",
      symbol: "USDC",
      addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    },
  },
  {
    id: "usdc-base",
    label: "USDC (Base Native) — Target: 1.00 USD",
    assetId: {
      chainFamily: "evm" as const,
      network: "base",
      symbol: "USDC",
      addressOrIssuer: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    },
  },
  {
    id: "usdc-stellar-native",
    label: "USDC (Stellar Centre Native) — Target: 1.00 USD",
    assetId: {
      chainFamily: "stellar" as const,
      network: "stellar-pubnet",
      symbol: "USDC",
      addressOrIssuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    },
  },
  {
    id: "usdc-stellar-alt",
    label: "USDC (Alternative Stellar Issuer) — Target: 1.00 USD",
    assetId: {
      chainFamily: "stellar" as const,
      network: "stellar-pubnet",
      symbol: "USDC",
      addressOrIssuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    },
  },
  {
    id: "eurc-eth",
    label: "EURC (Ethereum Native) — Target: 1.00 EUR",
    assetId: {
      chainFamily: "evm" as const,
      network: "ethereum",
      symbol: "EURC",
      addressOrIssuer: "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
    },
  },
  {
    id: "eurc-stellar",
    label: "EURC (Stellar Native Anchor) — Target: 1.00 EUR",
    assetId: {
      chainFamily: "stellar" as const,
      network: "stellar-pubnet",
      symbol: "EURC",
      addressOrIssuer: "GDTVV5XCLBT27BDTX2F5C25J2R25227XJ7K25K25K25K25K25K25K25K",
    },
  },
  {
    id: "xsgd-eth",
    label: "XSGD (Ethereum StraitsX) — Target: 1.00 SGD",
    assetId: {
      chainFamily: "evm" as const,
      network: "ethereum",
      symbol: "XSGD",
      addressOrIssuer: "0x70e8de73ce538da2beed35d14187f6959a8eca96",
    },
  },
  {
    id: "jpyc-eth",
    label: "JPYC (Ethereum 100 JPY Basket) — Target: 100.00 JPY",
    assetId: {
      chainFamily: "evm" as const,
      network: "ethereum",
      symbol: "JPYC",
      addressOrIssuer: "0x431d5dff03120afa4bdf332c61a6e1766ef37bdb",
    },
  },
  {
    id: "custom",
    label: "Custom / Non-Standard Asset (Requires Explicit Target)",
    assetId: {
      chainFamily: "evm" as const,
      network: "custom-net",
      symbol: "CUSTOM",
      addressOrIssuer: "0x0000000000000000000000000000000000000000",
    },
  },
];

const FIXTURE_OPTIONS = [
  { id: "", label: "Default Live Evidence" },
  { id: "usd-and-nonusd-targets", label: "Fixture: USD and Non-USD Targets (EURC)" },
  { id: "deviation-recovery-with-gaps", label: "Fixture: Deviation Recovery with Gaps" },
  { id: "missing-rates-identity-collision", label: "Fixture: Missing Rates & Identity Collision" },
  { id: "empty", label: "Fixture: Empty Window State" },
  { id: "partial", label: "Fixture: Partial Sampling State" },
  { id: "unavailable", label: "Fixture: Unsupported / Unavailable Asset" },
];

/**
 * Form for selecting stable asset candidates, benchmarks, thresholds, and custom peg definitions.
 */
export function AssetReferenceForm({
  initialValues,
  onSubmit,
  isLoading,
  className = "",
}: AssetReferenceFormProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>("usdc-eth");
  const [selectedFixture, setSelectedFixture] = useState<string>(initialValues?.fixture || "");
  const [thresholdBps, setThresholdBps] = useState<number>(initialValues?.thresholdBps ?? 50);
  const [gapToleranceMinutes, setGapToleranceMinutes] = useState<number>(
    initialValues?.gapToleranceMinutes ?? 60,
  );

  const [customChain, setCustomChain] = useState<"evm" | "stellar">("evm");
  const [customNetwork, setCustomNetwork] = useState<string>("ethereum");
  const [customSymbol, setCustomSymbol] = useState<string>("");
  const [customAddress, setCustomAddress] = useState<string>("");
  const [customCurrency, setCustomCurrency] = useState<string>("USD");
  const [customTarget, setCustomTarget] = useState<string>("1.0");

  const isCustom = selectedPreset === "custom";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let assetId: CanonicalAssetId;
    let customDefinition: Partial<PegDefinition> | undefined;

    if (isCustom) {
      assetId = {
        chainFamily: customChain,
        network: customNetwork.trim(),
        symbol: customSymbol.trim().toUpperCase() || "UNKNOWN",
        addressOrIssuer: customAddress.trim().toLowerCase() || "unknown",
      };
      customDefinition = {
        referenceCurrency: customCurrency.trim().toUpperCase() || "USD",
        declaredTargetValue: Number.parseFloat(customTarget) || 1.0,
        name: `${assetId.symbol} (Declared Target)`,
        provenance: "Explicit user declared target value and reference currency",
      };
    } else {
      const preset = PRESET_OPTIONS.find((p) => p.id === selectedPreset);
      assetId = preset ? preset.assetId : PRESET_OPTIONS[0].assetId;
    }

    onSubmit({
      assetId,
      fixture: selectedFixture || undefined,
      thresholdBps,
      gapToleranceMinutes,
      customDefinition,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 backdrop-blur-sm ${className}`}
      aria-label="Peg Analysis Settings"
    >
      <div className="border-b border-zinc-800/80 pb-4">
        <h2 className="text-base font-semibold text-zinc-100">Analysis Controls</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Configure asset target definition, deviation thresholds, and sampling continuity bounds.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="preset-select" className="block text-xs font-medium text-zinc-300">
            Target Stable Asset
          </label>
          <select
            id="preset-select"
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            disabled={isLoading || Boolean(selectedFixture)}
            className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none disabled:opacity-50"
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="fixture-select" className="block text-xs font-medium text-zinc-300">
            Verification Fixture / Benchmark
          </label>
          <select
            id="fixture-select"
            value={selectedFixture}
            onChange={(e) => setSelectedFixture(e.target.value)}
            disabled={isLoading}
            className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none disabled:opacity-50"
          >
            {FIXTURE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isCustom && !selectedFixture && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-300 uppercase">
            Explicit Target Declaration (Required for Custom Asset)
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="custom-chain" className="block text-xs text-zinc-400">
                Chain Family
              </label>
              <select
                id="custom-chain"
                value={customChain}
                onChange={(e) => setCustomChain(e.target.value as "evm" | "stellar")}
                className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
              >
                <option value="evm">EVM</option>
                <option value="stellar">Stellar</option>
              </select>
            </div>

            <div>
              <label htmlFor="custom-network" className="block text-xs text-zinc-400">
                Network Identifier
              </label>
              <input
                id="custom-network"
                type="text"
                value={customNetwork}
                onChange={(e) => setCustomNetwork(e.target.value)}
                placeholder="ethereum / base / stellar-pubnet"
                className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                required
              />
            </div>

            <div>
              <label htmlFor="custom-symbol" className="block text-xs text-zinc-400">
                Asset Symbol
              </label>
              <input
                id="custom-symbol"
                type="text"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                placeholder="e.g. USDP"
                className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                required
              />
            </div>

            <div className="sm:col-span-3">
              <label htmlFor="custom-address" className="block text-xs text-zinc-400">
                Contract Address or Issuer Account
              </label>
              <input
                id="custom-address"
                type="text"
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                placeholder="0x... or G..."
                className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none"
                required
              />
            </div>

            <div>
              <label htmlFor="custom-currency" className="block text-xs text-zinc-400">
                Declared Reference Currency
              </label>
              <input
                id="custom-currency"
                type="text"
                value={customCurrency}
                onChange={(e) => setCustomCurrency(e.target.value)}
                placeholder="USD, EUR, SGD, JPY"
                className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                required
              />
            </div>

            <div>
              <label htmlFor="custom-target" className="block text-xs text-zinc-400">
                Declared Target Peg Value
              </label>
              <input
                id="custom-target"
                type="number"
                step="any"
                min="0.0001"
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none"
                required
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="threshold-bps" className="block text-xs font-medium text-zinc-300">
            Breach Threshold: <span className="font-mono text-zinc-100">{thresholdBps} bps</span> (
            {(thresholdBps / 100).toFixed(2)}%)
          </label>
          <input
            id="threshold-bps"
            type="range"
            min="10"
            max="300"
            step="5"
            value={thresholdBps}
            onChange={(e) => setThresholdBps(Number(e.target.value))}
            disabled={isLoading}
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-zinc-300"
          />
          <span className="text-[11px] text-zinc-500">
            Deviations exceeding this threshold initiate tracked deviation episodes.
          </span>
        </div>

        <div>
          <label htmlFor="gap-tolerance" className="block text-xs font-medium text-zinc-300">
            Max Continuity Gap:{" "}
            <span className="font-mono text-zinc-100">{gapToleranceMinutes} min</span>
          </label>
          <input
            id="gap-tolerance"
            type="number"
            min="5"
            max="1440"
            step="5"
            value={gapToleranceMinutes}
            onChange={(e) => setGapToleranceMinutes(Math.max(5, Number(e.target.value)))}
            disabled={isLoading}
            className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
          />
          <span className="text-[11px] text-zinc-500">
            Intervals between observations longer than this are strictly classified as unobserved gaps.
          </span>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center rounded-lg bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white focus:ring-2 focus:ring-zinc-400 focus:outline-none disabled:opacity-50"
        >
          {isLoading ? "Executing Analysis..." : "Execute Deviation Analysis"}
        </button>
      </div>
    </form>
  );
}
