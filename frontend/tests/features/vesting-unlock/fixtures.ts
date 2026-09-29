import type { RawVestingSchedule, VestingAsset, VestingReadResult, VestingReader } from "@/server/research/vesting-unlock/schema";
import { createFixtureReader } from "@/server/research/vesting-unlock/reader";

export const EVM_NETWORK = "ethereum";
export const STELLAR_NETWORK = "stellar-testnet";
export const BENEFICIARY = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
export const STELLAR_BENEFICIARY = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const TOKEN: VestingAsset = {
  identity: "ethereum:0xtoken0000000000000000000000000000000001",
  symbol: "RAC",
  network: EVM_NETWORK,
  chainFamily: "evm",
  decimals: 18,
};

export const STELLAR_ASSET: VestingAsset = {
  identity: "stellar-testnet:RAC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  symbol: "RAC",
  network: STELLAR_NETWORK,
  chainFamily: "stellar",
  decimals: 7,
};

const OBSERVED_AT = "2026-03-01T12:00:00.000Z";
const CLOSE_TIME = "2026-03-01T11:59:00.000Z";

function observation(overrides: Partial<VestingReadResult["observation"]> = {}): VestingReadResult["observation"] {
  return {
    ledger: 1_000_000,
    closeTime: CLOSE_TIME,
    source: "fixture://vesting",
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

export const CLIFF_SCHEDULE: RawVestingSchedule = {
  scheduleId: "0xvesting-cliff",
  revision: 1,
  sourceType: "onchain_enforced",
  supported: true,
  asset: TOKEN,
  beneficiary: BENEFICIARY,
  plan: {
    kind: "cliff",
    amountBaseUnits: "1000000000000000000",
    cliffAt: "2026-06-01T00:00:00.000Z",
  },
  provenance: "fixture cliff contract",
  evidenceUrl: "https://example.test/evidence/cliff",
};

export const LINEAR_SCHEDULE: RawVestingSchedule = {
  scheduleId: "0xvesting-linear",
  revision: 1,
  sourceType: "onchain_enforced",
  supported: true,
  asset: TOKEN,
  beneficiary: BENEFICIARY,
  plan: {
    kind: "linear",
    amountBaseUnits: "12000000000000000000",
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2027-01-01T00:00:00.000Z",
    cliffAt: "2026-04-01T00:00:00.000Z",
  },
  provenance: "fixture linear contract",
  evidenceUrl: "https://example.test/evidence/linear",
};

export const PUBLISHED_SCHEDULE: RawVestingSchedule = {
  scheduleId: "issuer-team-allocation",
  revision: 2,
  sourceType: "published_only",
  supported: true,
  asset: TOKEN,
  beneficiary: BENEFICIARY,
  plan: {
    kind: "fixed_tranches",
    tranches: [
      { amountBaseUnits: "500000000000000000", unlockAt: "2026-01-01T00:00:00.000Z", released: true },
      { amountBaseUnits: "500000000000000000", unlockAt: "2026-07-01T00:00:00.000Z" },
    ],
  },
  provenance: "issuer blog schedule",
  evidenceUrl: "https://example.test/evidence/published",
};

export const REVISION_OLD: RawVestingSchedule = {
  scheduleId: "0xvesting-revised",
  revision: 1,
  sourceType: "onchain_enforced",
  supported: true,
  cancelled: true,
  supersededBy: "0xvesting-revised:r2",
  asset: TOKEN,
  beneficiary: BENEFICIARY,
  plan: {
    kind: "cliff",
    amountBaseUnits: "9000000000000000000",
    cliffAt: "2026-09-01T00:00:00.000Z",
  },
  provenance: "old revision",
};

export const REVISION_NEW: RawVestingSchedule = {
  scheduleId: "0xvesting-revised",
  revision: 2,
  sourceType: "onchain_enforced",
  supported: true,
  asset: TOKEN,
  beneficiary: BENEFICIARY,
  plan: {
    kind: "cliff",
    amountBaseUnits: "3000000000000000000",
    cliffAt: "2026-09-01T00:00:00.000Z",
  },
  provenance: "amended revision",
};

export const UNKNOWN_BENEFICIARY: RawVestingSchedule = {
  scheduleId: "0xvesting-anon",
  revision: 1,
  sourceType: "onchain_enforced",
  supported: true,
  asset: TOKEN,
  beneficiary: null,
  plan: {
    kind: "cliff",
    amountBaseUnits: "1000000000000000000",
    cliffAt: "2026-08-01T00:00:00.000Z",
  },
  provenance: "anonymous vesting",
};

export const UNSUPPORTED: RawVestingSchedule = {
  scheduleId: "0xarbitrary",
  revision: 0,
  sourceType: "onchain_enforced",
  supported: false,
  unsupportedReason: "Arbitrary vesting bytecode is out of scope.",
  asset: TOKEN,
  beneficiary: BENEFICIARY,
  plan: { kind: "cliff", amountBaseUnits: "0", cliffAt: "2026-01-01T00:00:00.000Z" },
  provenance: "unsupported",
};

export const STELLAR_CLIFF: RawVestingSchedule = {
  scheduleId: "CVESTINGEXAMPLE",
  revision: 1,
  sourceType: "onchain_enforced",
  supported: true,
  asset: STELLAR_ASSET,
  beneficiary: STELLAR_BENEFICIARY,
  plan: {
    kind: "cliff",
    amountBaseUnits: "10000000",
    cliffAt: "2026-05-01T00:00:00.000Z",
    cliffLedger: 1_100_000,
  },
  provenance: "stellar vesting contract",
  evidenceUrl: "https://example.test/evidence/stellar",
};

export const STALE_RESULT: VestingReadResult = {
  observation: observation({
    closeTime: "2026-02-01T00:00:00.000Z",
    observedAt: "2026-03-01T12:00:00.000Z",
  }),
  schedules: [CLIFF_SCHEDULE],
  gaps: [],
};

export function resultFor(schedules: RawVestingSchedule[], observationOverrides: Partial<VestingReadResult["observation"]> = {}): VestingReadResult {
  return {
    observation: observation(observationOverrides),
    schedules,
    gaps: [],
  };
}

export const FULL_WORLD = {
  bySourceId: {
    "0xvesting-cliff": resultFor([CLIFF_SCHEDULE]),
    "0xvesting-linear": resultFor([LINEAR_SCHEDULE]),
    "issuer-team-allocation": resultFor([PUBLISHED_SCHEDULE]),
    "0xvesting-revised": resultFor([REVISION_OLD, REVISION_NEW]),
    "0xvesting-anon": resultFor([UNKNOWN_BENEFICIARY]),
    "0xarbitrary": resultFor([UNSUPPORTED]),
    CVESTINGEXAMPLE: resultFor([STELLAR_CLIFF]),
    "0xvesting-stale": STALE_RESULT,
  },
};

export function createTestReader(world = FULL_WORLD): VestingReader {
  return createFixtureReader(world);
}

export function request(overrides: Record<string, unknown> = {}) {
  return {
    network: EVM_NETWORK,
    chainFamily: "evm" as const,
    displayTimeZone: "UTC",
    asOf: "2026-03-01T12:00:00.000Z",
    sources: [{ kind: "evm_vesting_contract" as const, id: "0xvesting-cliff", network: EVM_NETWORK }],
    ...overrides,
  };
}
