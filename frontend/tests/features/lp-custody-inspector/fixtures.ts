import { SELECTORS, encodeAddressArg, encodeBalanceOf } from "@/server/research/lp-custody-inspector/abi";
import type { LpRpc } from "@/server/research/lp-custody-inspector/rpc";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const wallet = "0x9999999999999999999999999999999999999999";
export const pool = "0x1111111111111111111111111111111111111111";
export const token0 = "0x2222222222222222222222222222222222222222";
export const token1 = "0x3333333333333333333333333333333333333333";
export const burnAddress = "0x000000000000000000000000000000000000dead";
export const lockAddress = "0x4444444444444444444444444444444444444444";
export const unknownHolder = "0x5555555555555555555555555555555555555555";

function addressWord(address: string): string {
  return "0x" + encodeAddressArg(address);
}

function uintWord(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

type PoolFixtureOptions = {
  totalSupply?: bigint;
  balances?: Record<string, bigint>;
  missingCandidates?: string[];
  failToken0?: boolean;
  reorg?: boolean;
  concentratedLiquidity?: boolean;
};

/**
 * Builds a fake `LpRpc` for a two-token constant-product pool. `balances`
 * maps a lowercase holder address to its raw LP balance; anything not
 * present resolves to zero unless listed in `missingCandidates`, in which
 * case the call resolves to `null` (provider could not read it).
 */
export function poolReader(options: PoolFixtureOptions = {}): LpRpc {
  const totalSupply = options.totalSupply ?? 1_000_000n;
  const balances = options.balances ?? {};
  const missing = new Set((options.missingCandidates ?? []).map((address) => address.toLowerCase()));
  let blockHashCalls = 0;

  return {
    async blockNumber() {
      return 100n;
    },
    async blockHash() {
      blockHashCalls += 1;
      if (options.reorg) return blockHashCalls === 1 ? "0xaaa" : "0xbbb";
      return "0xsame";
    },
    async call(to, data) {
      if (options.failToken0 && data === SELECTORS.token0) return null;
      if (data === SELECTORS.token0) return addressWord(token0);
      if (data === SELECTORS.token1) return addressWord(token1);
      if (data === SELECTORS.totalSupply) return options.concentratedLiquidity ? null : uintWord(totalSupply);
      if (data === SELECTORS.getReserves) {
        return "0x" + totalSupply.toString(16).padStart(64, "0") + totalSupply.toString(16).padStart(64, "0") + "0".repeat(64);
      }
      for (const holder of Object.keys(balances)) {
        if (data === encodeBalanceOf(holder)) return uintWord(balances[holder]);
      }
      if ([...missing].some((holder) => data === encodeBalanceOf(holder))) return null;
      // Any other balanceOf call (including the automatic burn-address checks
      // this fixture did not seed) resolves to zero, same as a real chain.
      return uintWord(0n);
    },
  };
}
