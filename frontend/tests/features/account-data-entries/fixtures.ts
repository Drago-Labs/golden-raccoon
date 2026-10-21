import type { DataEntryDeps } from "@/server/research/account-data-entries/service";
import type { RawManageData } from "@/server/research/account-data-entries/entryHistory";
import binaryEntries from "./data/binary-entries.json";
import deletedKey from "./data/deleted-key.json";
import providerUnavailable from "./data/provider-unavailable.json";
import textEntries from "./data/text-entries.json";

export type FixtureFile = {
  account_id: string;
  observation_ledger: number;
  account: {
    id: string;
    sequence: string;
    subentry_count: number;
    last_modified_ledger: number;
    data: Record<string, string>;
  };
  operations: Array<{
    id: string;
    paging_token: string;
    type: string;
    name: string | null;
    value: string | null;
    source_account: string;
    ledger: number;
    created_at: string;
  }>;
  truncated: boolean;
  oldest_ledger?: number;
};

export const textFixture = textEntries as FixtureFile;
export const binaryFixture = binaryEntries as FixtureFile;
export const deletedFixture = deletedKey as FixtureFile;
export const unavailableFixture = providerUnavailable;

function operationsOf(fixture: FixtureFile): RawManageData[] {
  return fixture.operations
    .filter((operation) => operation.type === "manage_data" && operation.name)
    .map((operation) => ({
      id: operation.id,
      pagingToken: operation.paging_token,
      key: operation.name ?? "",
      valueBase64: operation.value,
      sourceAccount: operation.source_account,
      ledger: operation.ledger,
    }));
}

export function depsFor(fixture: FixtureFile): DataEntryDeps {
  return {
    readAccount: async (_network, account) => {
      if (account !== fixture.account.id) return { status: "missing" };
      return {
        status: "ok",
        value: {
          id: fixture.account.id,
          data: fixture.account.data,
          observationLedger: fixture.account.last_modified_ledger,
        },
      };
    },
    readHistory: async () => ({
      status: "ok",
      value: {
        operations: operationsOf(fixture),
        truncated: fixture.truncated,
        oldestLedger: fixture.oldest_ledger ?? (fixture.operations.length === 0 ? null : Math.min(...fixture.operations.map((operation) => operation.ledger))),
      },
    }),
  };
}

export function unavailableDeps(): DataEntryDeps {
  return {
    readAccount: async () => ({ status: "unavailable", reason: unavailableFixture.reason }),
    readHistory: async () => ({ status: "missing" }),
  };
}

export function requestFor(fixture: FixtureFile, recentWindowLedgers = 30) {
  return { account: fixture.account.id, network: "stellar-testnet" as const, recentWindowLedgers };
}
