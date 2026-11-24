import type { RawIssuerOperation } from "@/server/research/issuance-ledger/classification";
import { decimalToStroops } from "@/server/research/issuance-ledger/decimalMath";
import type { IssuanceDeps } from "@/server/research/issuance-ledger/service";
import burnHeavy from "./data/burn-heavy.json";
import providerUnavailable from "./data/provider-unavailable.json";
import reconciledAsset from "./data/reconciled-asset.json";
import unreconciledAsset from "./data/unreconciled-asset.json";

export type FixtureFile = {
  from_ledger: number;
  to_ledger: number;
  asset_code: string;
  issuer: string;
  holder: string;
  opening_stroops: string;
  network_supply: string;
  truncated: boolean;
  checkpoints: Array<{ ledger: number; network_supply: string }>;
  operations: RawIssuerOperation[];
};

export const reconciledFixture = reconciledAsset as FixtureFile;
export const unreconciledFixture = unreconciledAsset as FixtureFile;
export const burnHeavyFixture = burnHeavy as FixtureFile;
export const unavailableFixture = providerUnavailable as {
  error: string;
  reason: string;
  asset_code: string;
  issuer: string;
};

export function depsFor(fixture: FixtureFile, truncated = fixture.truncated): IssuanceDeps {
  return {
    readHistory: async (_network, assetCode, issuer) => {
      if (assetCode !== fixture.asset_code || issuer !== fixture.issuer) return { status: "missing" };
      const ledgers = fixture.operations.map((op) => op.ledger);
      return {
        status: "ok",
        value: {
          operations: fixture.operations,
          openingStroops: BigInt(fixture.opening_stroops),
          checkpoints: fixture.checkpoints.map((row) => ({
            ledger: row.ledger,
            networkStroops: decimalToStroops(row.network_supply),
          })),
          networkSupplyStroops: decimalToStroops(fixture.network_supply),
          truncated,
          oldestLedger: ledgers.length === 0 ? fixture.from_ledger : Math.min(...ledgers),
        },
      };
    },
  };
}

export function unavailableDeps(): IssuanceDeps {
  return { readHistory: async () => ({ status: "unavailable", reason: unavailableFixture.reason }) };
}

export function requestFor(fixture: Pick<FixtureFile, "asset_code" | "issuer" | "from_ledger" | "to_ledger">) {
  return {
    assetCode: fixture.asset_code,
    issuer: fixture.issuer,
    network: "stellar-testnet" as const,
    fromLedger: fixture.from_ledger,
    toLedger: fixture.to_ledger,
  };
}
