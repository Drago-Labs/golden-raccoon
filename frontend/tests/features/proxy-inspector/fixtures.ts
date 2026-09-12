/**
 * Fixture chains for the proxy inspector.
 *
 * The whole feature reads through one narrow port, so a fixture is just a map
 * from address to what that address would have returned. No network is
 * touched, no key exists, and every scenario below is a plain object a reader
 * can check against the assertions by eye.
 */
import { STANDARD_SLOTS, type ChainReader } from "@/server/research/proxy-inspector/schema";

export const SLOT_IMPLEMENTATION = STANDARD_SLOTS.erc1967Implementation.slot;
export const SLOT_BEACON = STANDARD_SLOTS.erc1967Beacon.slot;
export const SLOT_ADMIN = STANDARD_SLOTS.erc1967Admin.slot;
export const SLOT_LEGACY = STANDARD_SLOTS.legacyZeppelinImplementation.slot;

export const ZERO_WORD = `0x${"0".repeat(64)}`;

/** Pads an address into the 32-byte word a storage read returns. */
export function addressWord(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

export const PROXY = "0x1111111111111111111111111111111111111111";
export const IMPLEMENTATION = "0x2222222222222222222222222222222222222222";
export const ADMIN = "0x3333333333333333333333333333333333333333";
export const BEACON = "0x4444444444444444444444444444444444444444";
export const BEACON_IMPL = "0x5555555555555555555555555555555555555555";
export const BEACON_OWNER = "0x6666666666666666666666666666666666666666";
export const EOA = "0x7777777777777777777777777777777777777777";
export const SECOND_PROXY = "0x8888888888888888888888888888888888888888";

type AddressState = {
  /** Runtime code, or "0x" for an account that holds none. */
  code?: string;
  /** Storage words by slot. An absent slot reads as zero, like a real chain. */
  slots?: Record<string, string>;
  /** Responses to `eth_call`, keyed by selector. A thrown value rejects. */
  calls?: Record<string, string | Error>;
  /** When set, every read of this address rejects. */
  readFailure?: string;
};

export type FixtureWorld = {
  blockNumber?: string | Error;
  addresses: Record<string, AddressState>;
};

/** Counts reads so tests can assert the walk stays bounded. */
export type CountingReader = ChainReader & { callCount: () => number; log: () => string[] };

export function createFixtureReader(world: FixtureWorld): CountingReader {
  let count = 0;
  const log: string[] = [];

  function stateOf(address: string): AddressState {
    return world.addresses[address.toLowerCase()] ?? {};
  }

  return {
    callCount: () => count,
    log: () => [...log],

    async getBlockNumber() {
      count += 1;
      log.push("eth_blockNumber");

      if (world.blockNumber instanceof Error) throw world.blockNumber;

      return world.blockNumber ?? "0x1312d00";
    },

    async getCode(address) {
      count += 1;
      log.push(`eth_getCode ${address.toLowerCase()}`);

      const state = stateOf(address);

      if (state.readFailure) throw new Error(state.readFailure);

      return state.code ?? "0x";
    },

    async getStorageAt(address, slot) {
      count += 1;
      log.push(`eth_getStorageAt ${address.toLowerCase()} ${slot}`);

      const state = stateOf(address);

      if (state.readFailure) throw new Error(state.readFailure);

      return state.slots?.[slot] ?? ZERO_WORD;
    },

    async call(to, data) {
      count += 1;
      log.push(`eth_call ${to.toLowerCase()} ${data}`);

      const state = stateOf(to);

      if (state.readFailure) throw new Error(state.readFailure);

      const response = state.calls?.[data];

      if (response instanceof Error) throw response;
      if (response === undefined) throw new Error("execution reverted");

      return response;
    },
  };
}

/** A plain ERC-1967 transparent proxy with an admin and a live implementation. */
export const directProxyWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x363d3d373d3d3d363d73",
      slots: {
        [SLOT_IMPLEMENTATION]: addressWord(IMPLEMENTATION),
        [SLOT_ADMIN]: addressWord(ADMIN),
      },
    },
    [IMPLEMENTATION]: { code: "0x6080604052348015" },
    [ADMIN]: { code: "0x60806040" },
  },
};

/** A beacon proxy: the proxy holds a beacon, the beacon names the implementation. */
export const beaconProxyWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x363d3d373d3d3d363d73",
      slots: { [SLOT_BEACON]: addressWord(BEACON) },
    },
    [BEACON]: {
      code: "0x6080604052",
      calls: {
        "0x5c60da1b": addressWord(BEACON_IMPL),
        "0x8da5cb5b": addressWord(BEACON_OWNER),
      },
    },
    [BEACON_IMPL]: { code: "0x6080604052348015" },
  },
};

/**
 * A UUPS proxy: an implementation slot, and no admin slot at all.
 *
 * This is the fixture the "absence is not immutability" rule is built for.
 */
export const uupsUnknownAuthorityWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x363d3d373d3d3d363d73",
      slots: { [SLOT_IMPLEMENTATION]: addressWord(IMPLEMENTATION) },
    },
    [IMPLEMENTATION]: { code: "0x6080604052348015" },
  },
};

/** Two proxies pointing at each other. */
export const cyclicWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x363d3d37",
      slots: { [SLOT_IMPLEMENTATION]: addressWord(SECOND_PROXY) },
    },
    [SECOND_PROXY]: {
      code: "0x363d3d37",
      slots: { [SLOT_IMPLEMENTATION]: addressWord(PROXY) },
    },
  },
};

/** Both the implementation slot and the beacon slot are set. */
export const conflictingSlotsWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x363d3d37",
      slots: {
        [SLOT_IMPLEMENTATION]: addressWord(IMPLEMENTATION),
        [SLOT_BEACON]: addressWord(BEACON),
      },
    },
    [IMPLEMENTATION]: { code: "0x6080604052" },
    [BEACON]: { code: "0x6080", calls: { "0x5c60da1b": addressWord(BEACON_IMPL) } },
    [BEACON_IMPL]: { code: "0x6080604052" },
  },
};

/** The beacon slot points at an address that will not answer implementation(). */
export const revertingBeaconWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x363d3d37",
      slots: { [SLOT_BEACON]: addressWord(BEACON) },
    },
    [BEACON]: { code: "0x6080", calls: { "0x5c60da1b": new Error("execution reverted") } },
  },
};

/** An address with no code: a wallet, not a contract. */
export const eoaWorld: FixtureWorld = {
  addresses: { [PROXY]: { code: "0x" } },
};

/** A contract whose slots are unreadable: partial, not empty. */
export const partialReadWorld: FixtureWorld = {
  addresses: {
    [PROXY]: { code: "0x6080604052" },
  },
  blockNumber: "0x1312d00",
};

/** The target's own code read fails: unavailable, not "no contract". */
export const unavailableWorld: FixtureWorld = {
  addresses: { [PROXY]: { readFailure: "provider unavailable" } },
};

/** A slot occupied by unrelated, non-address state. */
export const dirtySlotWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x6080604052",
      slots: { [SLOT_IMPLEMENTATION]: `0x${"ab".repeat(32)}` },
    },
  },
};

/** An implementation slot that exists but holds zero. */
export const zeroImplementationWorld: FixtureWorld = {
  addresses: {
    [PROXY]: {
      code: "0x6080604052",
      slots: { [SLOT_IMPLEMENTATION]: ZERO_WORD },
    },
  },
};

/** A chain of proxies longer than the published depth bound. */
export function deepChainWorld(length: number): FixtureWorld {
  const addresses: Record<string, AddressState> = {};

  for (let index = 0; index < length; index += 1) {
    const current = `0x${String(index + 1).padStart(40, "a")}`;
    const next = `0x${String(index + 2).padStart(40, "a")}`;

    addresses[current] = {
      code: "0x363d3d37",
      slots: { [SLOT_IMPLEMENTATION]: addressWord(next) },
    };
  }

  return { addresses };
}

export const DEEP_CHAIN_HEAD = `0x${String(1).padStart(40, "a")}`;

export const baseRequest = { network: "ethereum", address: PROXY } as const;

/**
 * A `fetch` stub that answers JSON-RPC from a fixture world.
 *
 * This exercises the production reader in `rpc.ts` without a network, so the
 * route test covers request shaping and error mapping rather than only the
 * service behind them.
 */
export function createRpcFetchStub(world: FixtureWorld) {
  const reader = createFixtureReader(world);

  return async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method: string; params: unknown[] };

    try {
      let result: string;

      switch (body.method) {
        case "eth_blockNumber":
          result = await reader.getBlockNumber();
          break;
        case "eth_getCode":
          result = await reader.getCode(String(body.params[0]), String(body.params[1]));
          break;
        case "eth_getStorageAt":
          result = await reader.getStorageAt(String(body.params[0]), String(body.params[1]), String(body.params[2]));
          break;
        case "eth_call": {
          const target = body.params[0] as { to: string; data: string };
          result = await reader.call(target.to, target.data, String(body.params[1]));
          break;
        }
        default:
          return { ok: true, status: 200, json: async () => ({ error: { message: "unsupported method" } }) } as unknown as Response;
      }

      return { ok: true, status: 200, json: async () => ({ result }) } as unknown as Response;
    } catch (error) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ error: { message: (error as Error).message } }),
      } as unknown as Response;
    }
  };
}
