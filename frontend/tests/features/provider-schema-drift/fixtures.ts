import type { DriftRequest } from "@/server/research/provider-schema-drift/schema";
import { CONTRACT_VERSIONS } from "@/server/research/provider-schema-drift/contracts";

const OBSERVED = "2026-01-20T12:00:00.000Z";
const ACCOUNT = "G" + "A".repeat(55);
const EVM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const stellarBaseline = {
  schemaVersion: CONTRACT_VERSIONS.stellar,
  identity: { chainId: "stellar-pubnet", accountId: ACCOUNT },
  balance: { amount: "1000", unit: "stroops" },
  observedAt: OBSERVED,
};

export const unitShiftedStellar: DriftRequest = {
  observedAt: OBSERVED,
  mode: "replay",
  probes: [
    {
      provider: "stellar",
      available: true,
      baseline: stellarBaseline,
      observed: {
        ...stellarBaseline,
        balance: { amount: "1", unit: "XLM" },
      },
    },
  ],
};

export const additiveMarket: DriftRequest = {
  observedAt: OBSERVED,
  mode: "replay",
  probes: [
    {
      provider: "market",
      available: true,
      baseline: {
        schemaVersion: CONTRACT_VERSIONS.market,
        identity: { symbol: "XLM", chainId: "stellar-pubnet" },
        price: { amount: "0.12", unit: "usd" },
        observedAt: OBSERVED,
      },
      observed: {
        schemaVersion: CONTRACT_VERSIONS.market,
        identity: { symbol: "XLM", chainId: "stellar-pubnet" },
        price: { amount: "0.12", unit: "usd" },
        observedAt: OBSERVED,
        extraMeta: { source: "vendor" },
      },
    },
  ],
};

export const unavailableProbe: DriftRequest = {
  observedAt: OBSERVED,
  mode: "replay",
  probes: [
    {
      provider: "evm",
      available: false,
      baseline: {
        schemaVersion: CONTRACT_VERSIONS.evm,
        identity: { chainId: "ethereum", address: EVM },
        balance: { amount: "1", unit: "wei" },
        observedAt: OBSERVED,
      },
      observed: null,
    },
  ],
};

export const flakyProbe: DriftRequest = {
  observedAt: OBSERVED,
  mode: "replay",
  probes: [
    {
      provider: "news",
      available: true,
      flaky: true,
      baseline: {
        schemaVersion: CONTRACT_VERSIONS.news,
        identity: { articleId: "a1" },
        headline: "Example",
        publishedAt: OBSERVED,
      },
      observed: {
        schemaVersion: CONTRACT_VERSIONS.news,
        identity: { articleId: "a1" },
        headline: "Example",
        publishedAt: OBSERVED,
      },
    },
  ],
};

export const secretRedaction: DriftRequest = {
  observedAt: OBSERVED,
  mode: "replay",
  probes: [
    {
      provider: "social",
      available: true,
      baseline: {
        schemaVersion: CONTRACT_VERSIONS.social,
        identity: { handle: "@bridge" },
        metrics: { followers: 10, unit: "accounts" },
        observedAt: OBSERVED,
        apiKey: "sk-live-should-never-appear",
        raw: { private_key: "secret-material" },
      },
      observed: {
        schemaVersion: CONTRACT_VERSIONS.social,
        identity: { handle: "@bridge" },
        metrics: { followers: 10, unit: "accounts" },
        observedAt: OBSERVED,
        apiKey: "sk-live-should-never-appear",
        note: ACCOUNT,
      },
    },
  ],
};

export const unchangedReplay: DriftRequest = {
  observedAt: OBSERVED,
  mode: "replay",
  probes: [
    {
      provider: "stellar",
      available: true,
      baseline: stellarBaseline,
      observed: structuredClone(stellarBaseline),
    },
  ],
};
