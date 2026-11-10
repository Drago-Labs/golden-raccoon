import type {
  BlendServiceDeps,
  OraclePriceEntry,
  RawAccountPositions,
  ReserveConfig,
} from "@/server/research/blend-positions";

export const POOL_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
export const OTHER_POOL_ID = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB6S2";
export const ACCOUNT_ID = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export function depsFromFixture(fixture: {
  reserves: ReserveConfig[];
  positions: RawAccountPositions;
  oracles: OraclePriceEntry[];
}): BlendServiceDeps {
  return {
    poolConfigProvider: {
      async readPoolReserves() {
        return fixture.reserves;
      },
    },
    positionProvider: {
      async readAccountPositions() {
        return fixture.positions;
      },
    },
    oraclePriceProvider: {
      async readOraclePrices() {
        return fixture.oracles;
      },
    },
  };
}
