import type { BalanceDeps } from "@/server/research/balance-reconciliation/service";
import type { RawEffect } from "@/server/research/balance-reconciliation/effectClassifier";
import type { FeeTransaction } from "@/server/research/balance-reconciliation/feeAttribution";
import feeBumpSponsor from "./data/fee-bump-sponsor.json";
import matchedAccount from "./data/matched-account.json";
import providerUnavailable from "./data/provider-unavailable.json";
import unexplainedDelta from "./data/unexplained-delta.json";

export type FixtureFile = {
  from_ledger: number;
  to_ledger: number;
  account: string;
  inner_account?: string;
  opening: Record<string, string>;
  closing: Record<string, string>;
  truncated: boolean;
  effects: RawEffect[];
  transactions: Array<{
    hash: string;
    ledger: number;
    fee_charged: string;
    fee_account: string;
    source_account: string;
    fee_bump: boolean;
  }>;
};

export const matchedFixture = matchedAccount as FixtureFile;
export const unexplainedFixture = unexplainedDelta as FixtureFile;
export const feeBumpFixture = feeBumpSponsor as FixtureFile;
export const unavailableFixture = providerUnavailable as { error: string; reason: string; account: string };

function transactionsOf(fixture: FixtureFile): FeeTransaction[] {
  return fixture.transactions.map((transaction) => ({
    hash: transaction.hash,
    ledger: transaction.ledger,
    feeChargedStroops: transaction.fee_charged,
    feeAccount: transaction.fee_account,
    sourceAccount: transaction.source_account,
    feeBump: transaction.fee_bump,
  }));
}

export function depsFor(fixture: FixtureFile, truncated = fixture.truncated): BalanceDeps {
  return {
    readHistory: async (_network, account) => {
      if (account !== fixture.account) return { status: "missing" };
      const ledgers = [...fixture.effects.map((effect) => effect.ledger), ...fixture.transactions.map((transaction) => transaction.ledger)];
      return {
        status: "ok",
        value: {
          effects: fixture.effects,
          transactions: transactionsOf(fixture),
          opening: fixture.opening,
          closing: fixture.closing,
          truncated,
          oldestLedger: ledgers.length === 0 ? fixture.from_ledger : Math.min(...ledgers),
        },
      };
    },
  };
}

export function unavailableDeps(): BalanceDeps {
  return { readHistory: async () => ({ status: "unavailable", reason: unavailableFixture.reason }) };
}

export function requestFor(fixture: Pick<FixtureFile, "account" | "from_ledger" | "to_ledger">) {
  return { account: fixture.account, network: "stellar-testnet" as const, fromLedger: fixture.from_ledger, toLedger: fixture.to_ledger };
}
