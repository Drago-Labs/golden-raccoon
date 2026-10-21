/**
 * Recorded Horizon-shaped fixtures. Readers built here never call the network.
 */
import concentratedAsset from "./data/concentrated-asset.json";
import partialCoverage from "./data/partial-coverage.json";
import poolHeavyAsset from "./data/pool-heavy-asset.json";
import providerUnavailable from "./data/provider-unavailable.json";
import type { CanonicalAsset, HolderDistributionReader, SupplySnapshot } from "@/server/research/stellar-holders/schema";

export type RecordedFixture = {
  network: "stellar-testnet" | "stellar-pubnet";
  asset: string;
  ledger: number | null;
  ledgerClosedAt: string | null;
  failure: string | null;
  supply: Omit<SupplySnapshot, "ledger" | "ledgerClosedAt"> | null;
  pages: { cursor: string | null; nextCursor: string | null; records: { accountId: string; balance: string }[] }[];
  pools: { id: string; amount: string }[];
  poolsTruncated: boolean;
  claimables: { id: string; amount: string }[];
  claimablesTruncated: boolean;
  distributionAccounts: string[];
  tomlRead: boolean;
};

export const concentrated = concentratedAsset as RecordedFixture;
export const poolHeavy = poolHeavyAsset as RecordedFixture;
export const partial = partialCoverage as RecordedFixture;
export const unavailable = providerUnavailable as RecordedFixture;

export const recordedFixtures = [concentrated, poolHeavy, partial, unavailable];

export const ISSUER_A = "GAVH4D4VH6UJHT4XERRWWSGALJPQ7QIPTIKML4P54HVYA2WO6T4HGMMU";
export const ISSUER_B = "GAYNR3E3QZWCFIRFYLPTQADUX4CRS7M4ZOI3JPJEARUEEJGL23QIWOWE";
export const DIST = "GDKWN7TCZT2E6QGQYDGEWD2FLJEYWOXGX6AKBKT55Q6V6HIW76RPRMB7";
export const PUB_A = "GADN7W4OPTBNTRM64GRJGNSXA2NWB5CVCRENCRFM44WKXPQO4WQCUB3W";
export const PUB_B = "GDKU6WGUYCQHQHP6BMMAZY2ALM5JDAUE7JDEMP5DSJJPEAGFOFS7RQJH";
export const PUB_C = "GCHUZS5KQDI3TPG6SXSGBACK6G4QGKUFRUJ6S35D4JDGMJJ7S675ZGHB";
export const PARTIAL_A = "GCVEKXQBN4DWYU3EOXMPDOAZY24PDCGPXJDDTFGPZGXY7DMLPBODTF3M";
export const PARTIAL_B = "GDDEMGDGEUGNU6QR5YBFLLKCSD7MSIPS5N2M5BYZOEWO5N5USGJINQQ4";

export function readerFromFixtures(fixtures: RecordedFixture[]): HolderDistributionReader {
  function pick(asset: CanonicalAsset): RecordedFixture {
    const fixture = fixtures.find((item) => item.asset === asset.canonical && item.network === asset.network);

    if (!fixture) {
      throw new Error(`No recorded fixture for ${asset.resultKey}.`);
    }

    return fixture;
  }

  return {
    async readSupply(asset) {
      const fixture = pick(asset);

      if (fixture.failure || !fixture.supply || fixture.ledger === null) {
        throw new Error(fixture.failure ?? "Provider unavailable.");
      }

      return { ledger: fixture.ledger, ledgerClosedAt: fixture.ledgerClosedAt, ...fixture.supply };
    },
    async readTrustlinePage(asset, cursor, limit) {
      const page = pick(asset).pages.find((item) => item.cursor === cursor);

      if (!page) return { records: [], nextCursor: null };

      return { records: page.records.slice(0, limit), nextCursor: page.nextCursor };
    },
    async readLiquidityPools(asset) {
      const fixture = pick(asset);

      return { records: fixture.pools, truncated: fixture.poolsTruncated };
    },
    async readClaimableBalances(asset) {
      const fixture = pick(asset);

      return { records: fixture.claimables, truncated: fixture.claimablesTruncated };
    },
    async readDistributionAccounts(asset) {
      const fixture = pick(asset);

      return { accounts: fixture.distributionAccounts, tomlRead: fixture.tomlRead };
    },
  };
}

export function readerFromFixture(fixture: RecordedFixture): HolderDistributionReader {
  return readerFromFixtures([fixture]);
}
