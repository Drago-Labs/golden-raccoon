import React from "react";
import { type VenueModelType } from "@/server/research/liquidity-depth/schema";

export type VenueSelectorProps = {
  selectedNetwork: string;
  onSelectNetwork: (net: string) => void;
  baseSymbol: string;
  onChangeBaseSymbol: (sym: string) => void;
  quoteSymbol: string;
  onChangeQuoteSymbol: (sym: string) => void;
  tradeSide: "buy" | "sell";
  onToggleSide: (side: "buy" | "sell") => void;
  modelType: VenueModelType;
  venueName: string;
  feeBps: number;
};

const SUPPORTED_NETWORKS = [
  { id: "stellar-pubnet", name: "Stellar Pubnet" },
  { id: "stellar-testnet", name: "Stellar Testnet" },
  { id: "ethereum", name: "Ethereum (Uniswap v2)" },
  { id: "base", name: "Base (Uniswap v2)" },
  { id: "arbitrum", name: "Arbitrum" },
];

export function VenueSelector({
  selectedNetwork,
  onSelectNetwork,
  baseSymbol,
  onChangeBaseSymbol,
  quoteSymbol,
  onChangeQuoteSymbol,
  tradeSide,
  onToggleSide,
  modelType,
  venueName,
  feeBps,
}: VenueSelectorProps) {
  return (
    <div
      className="rounded-lg border border-white/10 bg-white/5 p-4"
      role="region"
      aria-label="Venue and Asset Configuration"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label
            htmlFor="network-select"
            className="block text-xs font-medium text-white/70"
          >
            Network / Environment
          </label>
          <select
            id="network-select"
            value={selectedNetwork}
            onChange={(e) => onSelectNetwork(e.target.value)}
            className="mt-1 w-full rounded border border-white/10 bg-[#121216] px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
          >
            {SUPPORTED_NETWORKS.map((net) => (
              <option key={net.id} value={net.id}>
                {net.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="base-symbol-input"
            className="block text-xs font-medium text-white/70"
          >
            Base Asset
          </label>
          <input
            id="base-symbol-input"
            type="text"
            value={baseSymbol}
            onChange={(e) => onChangeBaseSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. XLM or ETH"
            className="mt-1 w-full rounded border border-white/10 bg-[#121216] px-3 py-1.5 text-xs text-white uppercase focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="quote-symbol-input"
            className="block text-xs font-medium text-white/70"
          >
            Quote Asset
          </label>
          <input
            id="quote-symbol-input"
            type="text"
            value={quoteSymbol}
            onChange={(e) => onChangeQuoteSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. USDC"
            className="mt-1 w-full rounded border border-white/10 bg-[#121216] px-3 py-1.5 text-xs text-white uppercase focus:border-cyan-500 focus:outline-none"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-white/70">Execution Direction</span>
          <div className="mt-1 flex rounded border border-white/10 p-0.5 bg-[#121216]" role="group" aria-label="Trade direction">
            <button
              type="button"
              onClick={() => onToggleSide("buy")}
              className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                tradeSide === "buy"
                  ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
              aria-pressed={tradeSide === "buy"}
            >
              Buy Base
            </button>
            <button
              type="button"
              onClick={() => onToggleSide("sell")}
              className={`flex-1 rounded py-1 text-xs font-medium transition-colors ${
                tradeSide === "sell"
                  ? "bg-rose-500/20 text-rose-400 font-semibold"
                  : "text-white/60 hover:text-white"
              }`}
              aria-pressed={tradeSide === "sell"}
            >
              Sell Base
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs text-white/60">
        <div className="flex items-center gap-2">
          <span>Active Venue:</span>
          <span className="font-semibold text-white">{venueName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 font-medium ${
              modelType === "orderbook"
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : modelType === "constant_product"
                ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                : "bg-orange-500/10 text-orange-400 border border-orange-500/20"
            }`}
          >
            {modelType === "orderbook"
              ? "Order Book Model"
              : modelType === "constant_product"
              ? "Constant Product AMM (x*y=k)"
              : "Unsupported Model"}
          </span>
          {feeBps > 0 && <span>Fee: {(feeBps / 100).toFixed(2)}%</span>}
        </div>
      </div>
    </div>
  );
}
