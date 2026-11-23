import { normalizedPortfolio } from "@/server/research/allocation-drift/weights";
import type { AllocationSnapshot, TargetDefinition } from "@/server/research/allocation-drift/schema";
import balancedTargetData from "./data/balanced-target.json";
import driftedPortfolio from "./data/drifted-portfolio.json";
import invalidTargetData from "./data/invalid-target.json";
import providerUnavailable from "./data/provider-unavailable.json";

export const wallet = "0x4444444444444444444444444444444444444444";
export const foreignWallet = "0x5555555555555555555555555555555555555555";
export const network = "ethereum";

/** Asset identities as `normalizedPortfolio` derives them from the recorded read. */
export const WETH = "ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
export const USDC = "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const DAI = "ethereum:0x6b175474e89094c44da98b954eedeac495271d0f";

type RawObservation = (typeof driftedPortfolio)["observations"][number];

/** Deep copy without `structuredClone`, which jsdom does not expose. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function recordedObservations(): RawObservation[] {
  return clone(driftedPortfolio.observations);
}

/** The recorded provider payloads, normalized the way the service normalizes them. */
export function recordedSnapshots(): AllocationSnapshot[] {
  return recordedObservations().map((observation) =>
    normalizedPortfolio(observation, network, driftedPortfolio.source),
  );
}

/** 2026-11-20: WETH has drifted to 60% of a 100,000 USD portfolio. */
export function currentSnapshot(): AllocationSnapshot {
  return recordedSnapshots()[1];
}

/** 2026-11-01: the same wallet exactly on target. */
export function earlierSnapshot(): AllocationSnapshot {
  return recordedSnapshots()[0];
}

/** The recorded read with one holding the provider could not price. */
export function unpricedSnapshot(): AllocationSnapshot {
  const observation = recordedObservations()[1];
  const holdings = observation.holdings.map((holding, index) =>
    index === 2 ? { ...holding, priceUsd: null, priceStatus: "unavailable" } : holding,
  );
  return normalizedPortfolio(
    { ...observation, valuationStatus: "partial", holdings },
    network,
    driftedPortfolio.source,
  );
}

export function balancedTarget(): TargetDefinition {
  return clone(balancedTargetData) as TargetDefinition;
}

/** A target whose entries total 90%, not 100%. */
export function invalidTarget(): unknown {
  return clone(invalidTargetData);
}

/** The recorded portfolio read API response when no provider answered. */
export function unavailableRead() {
  return clone(providerUnavailable.result);
}

export function allocationRequest(overrides: Record<string, unknown> = {}) {
  return {
    walletAddress: wallet,
    network,
    windowStart: "2026-10-25T00:00:00.000Z",
    windowEnd: "2026-11-21T00:00:00.000Z",
    thresholdBps: 500,
    history: [],
    ...overrides,
  };
}

/** An in-memory stand-in for the browser preference storage. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}
