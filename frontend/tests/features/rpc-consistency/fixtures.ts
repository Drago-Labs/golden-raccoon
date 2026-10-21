import conflictingValues from "./data/conflicting-values.json";
import laggingProvider from "./data/lagging-provider.json";
import matchedAccount from "./data/matched-account.json";
import providerUnavailable from "./data/provider-unavailable.json";
import type { ProviderState } from "@/server/research/rpc-consistency/errors";
import type { ConsistencyDependencies } from "@/server/research/rpc-consistency/service";
import type { HorizonObservation, RpcObservation } from "@/server/research/rpc-consistency/schema";

export const ACCOUNT = "GCY6OG5CBR23KEFIKVJUILMJWFKWMLOTBVOORZ5BQWKTAV2WAZQ266DA";
export const ISSUER = "GAVP2FDG7NQV27RDXTMOTXGGE7IY32F5R3XGZIOH7GJ3WGVI27AHB3GW";
export const CONTRACT = "CADQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQP5KR";

export type RecordedFixture = {
  request: {
    network: "testnet" | "mainnet";
    target: string;
    trustlines?: Array<{ code: string; issuer: string }>;
    contractDataKeys?: string[];
  };
  horizon: ProviderState<HorizonObservation>;
  rpc: ProviderState<RpcObservation>;
};

export const matched = matchedAccount as RecordedFixture;
export const lagging = laggingProvider as RecordedFixture;
export const conflicting = conflictingValues as RecordedFixture;
export const unavailable = providerUnavailable as RecordedFixture;

/** Injects the recorded answers. Nothing in this helper performs I/O. */
export function probesFor(fixture: RecordedFixture): ConsistencyDependencies {
  return {
    readHorizon: async () => fixture.horizon,
    readRpc: async () => fixture.rpc,
  };
}

export function contractOnlyFixture(): RecordedFixture {
  return {
    request: {
      network: "testnet",
      target: CONTRACT,
      contractDataKeys: ["counter"],
    },
    horizon: {
      status: "available",
      observation: {
        provider: "horizon",
        network: "testnet",
        endpoint: "https://horizon-testnet.stellar.org",
        passphrase: "Test SDF Network ; September 2015",
        latestLedger: 5100,
        retentionStartLedger: 1000,
        retentionEndLedger: 5100,
        notFound: false,
        account: null,
        contractDataExposed: false,
        contractEntries: [],
        omittedTrustlines: 0,
        omittedLedgerKeys: 0,
      },
    },
    rpc: {
      status: "available",
      observation: {
        provider: "rpc",
        network: "testnet",
        endpoint: "https://soroban-testnet.stellar.org",
        passphrase: "Test SDF Network ; September 2015",
        latestLedger: 5100,
        retentionStartLedger: 1000,
        retentionEndLedger: 5100,
        notFound: false,
        account: null,
        contractDataExposed: true,
        contractEntries: [
          {
            key: "counter",
            value: '"7"',
            ledger: 5000,
            raw: { key: "counter", value: "7" },
          },
        ],
        omittedTrustlines: 0,
        omittedLedgerKeys: 0,
      },
    },
  };
}
