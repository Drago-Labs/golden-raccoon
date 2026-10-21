import type { DiagnosisDeps } from "@/server/research/tx-failure-diagnostics/service";
import type { AccountSnapshot } from "@/server/research/tx-failure-diagnostics/ledgerState";
import type { RecordedTransaction } from "@/server/research/tx-failure-diagnostics/transactionReader";
import badSequence from "./data/bad-sequence.json";
import feeBumpFailure from "./data/fee-bump-failure.json";
import opUnderfunded from "./data/op-underfunded.json";
import providerUnavailable from "./data/provider-unavailable.json";

export type FixtureFile = {
  hash: string;
  ledger: number;
  network: string;
  envelope_xdr: string;
  result_xdr: string;
  fee_charged: string;
  source_account: string;
  fee_source?: string | null;
  account: (AccountSnapshot & { last_modified_ledger?: number }) | null;
};

export const underfundedFixture = opUnderfunded as FixtureFile;
export const badSequenceFixture = badSequence as FixtureFile;
export const feeBumpFixture = feeBumpFailure as FixtureFile;
export const unavailableFixture = providerUnavailable;

export function recordedFrom(fixture: FixtureFile): RecordedTransaction {
  return {
    hash: fixture.hash,
    ledger: fixture.ledger,
    envelopeXdr: fixture.envelope_xdr,
    resultXdr: fixture.result_xdr,
    sourceAccount: fixture.source_account,
    feeSource: fixture.fee_source ?? null,
  };
}

export function depsFor(fixture: FixtureFile): DiagnosisDeps {
  return {
    readTransaction: async (_network, hash) => {
      if (hash.toLowerCase() !== fixture.hash.toLowerCase()) return { status: "missing" };
      return { status: "ok", value: recordedFrom(fixture) };
    },
    readAccount: async (_network, accountId) => {
      if (!fixture.account || fixture.account.id !== accountId) return { status: "missing" };
      return { status: "ok", value: fixture.account };
    },
  };
}

export function unavailableDeps(): DiagnosisDeps {
  return {
    readTransaction: async () => ({ status: "unavailable", reason: unavailableFixture.reason }),
    readAccount: async () => ({ status: "missing" }),
  };
}
