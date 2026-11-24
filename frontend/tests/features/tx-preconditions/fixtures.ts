import type { PreconditionsDeps } from "@/server/research/tx-preconditions/service";
import type { AccountLedgerState, CurrentLedgerState } from "@/server/research/tx-preconditions/ledgerState";
import validNow from "./data/valid-now.json";
import expiredBounds from "./data/expired-bounds.json";
import futureSequence from "./data/future-sequence.json";
import feeBump from "./data/fee-bump.json";
import providerUnavailable from "./data/provider-unavailable.json";

export type FixtureFile = {
  name: string;
  envelope_xdr: string;
  network: string;
  evaluated_at: string;
  ledger: number;
  closed_at: string;
  account: {
    id: string;
    sequence: string;
    sequence_ledger: number;
    sequence_time: string;
    last_modified_ledger?: number;
  } | null;
  fee_source?: string;
  extra_signer?: string;
};

export const validNowFixture = validNow as FixtureFile;
export const expiredBoundsFixture = expiredBounds as FixtureFile;
export const futureSequenceFixture = futureSequence as FixtureFile;
export const feeBumpFixture = feeBump as FixtureFile;
export const unavailableFixture = providerUnavailable as { name: string; reason: string };

function ledgerFrom(fixture: FixtureFile): CurrentLedgerState {
  return {
    ledger: fixture.ledger,
    closeTime: fixture.closed_at,
    closeTimeUnix: Math.floor(Date.parse(fixture.closed_at) / 1000),
  };
}

function accountFrom(fixture: FixtureFile): AccountLedgerState | null {
  if (!fixture.account) return null;
  return {
    id: fixture.account.id,
    sequence: fixture.account.sequence,
    sequenceTimeUnix: Number(fixture.account.sequence_time),
    sequenceLedger: fixture.account.sequence_ledger,
  };
}

export function depsFor(fixture: FixtureFile): PreconditionsDeps {
  return {
    readLedger: async () => ({ status: "ok", value: ledgerFrom(fixture) }),
    readAccount: async (_network, accountId) => {
      const account = accountFrom(fixture);
      if (!account || account.id !== accountId) return { status: "missing" };
      return { status: "ok", value: account };
    },
  };
}

export function unavailableDeps(): PreconditionsDeps {
  return {
    readLedger: async () => ({ status: "unavailable", reason: unavailableFixture.reason }),
    readAccount: async () => ({ status: "missing" }),
  };
}

export function requestFor(fixture: FixtureFile) {
  return {
    envelopeXdr: fixture.envelope_xdr,
    network: fixture.network as "stellar-testnet" | "stellar-pubnet",
    evaluatedAt: fixture.evaluated_at,
  };
}
