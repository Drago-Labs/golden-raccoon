import { SELECTORS, encodeAddressArg } from "@/server/research/vault-accounting/vaultReader";
import type { VaultRpc } from "@/server/research/vault-accounting/vaultReader";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const wallet = "0x9999999999999999999999999999999999999999";
export const vaultAddress = "0x1111111111111111111111111111111111111111";
export const underlyingAsset = "0x2222222222222222222222222222222222222222";

export function addressWord(address: string): string {
  return "0x" + encodeAddressArg(address);
}

export function uintWord(value: bigint): string {
  return "0x" + value.toString(16).padStart(64, "0");
}

/**
 * A "recorded response" fixture: maps either a full 4-byte-selector-plus-args
 * calldata string, or just a bare 4-byte selector (as a fallback for any
 * call to that function), to the hex word the provider returned. `null`
 * means the call reverted or returned no data.
 */
export type RecordedFixture = {
  blockNumber: string;
  blockHash?: string | null;
  responses: Record<string, string | null>;
};

export function recordedVaultRpc(fixture: RecordedFixture): VaultRpc {
  return {
    async blockNumber() {
      return BigInt(fixture.blockNumber);
    },
    async blockHash() {
      return fixture.blockHash ?? null;
    },
    async call(_to, data) {
      if (data in fixture.responses) return fixture.responses[data];
      const selector = data.slice(0, 10);
      if (selector in fixture.responses) return fixture.responses[selector];
      return null;
    },
  };
}

type VaultFixtureOptions = {
  blockNumber?: bigint;
  totalAssets?: bigint;
  totalSupply?: bigint;
  underlyingBalance?: bigint;
  missingAsset?: boolean;
  missingConvertToAssets?: boolean;
  missingPreviewDeposit?: boolean;
  missingPreviewRedeem?: boolean;
  /** Override `convertToAssets(shares)` for a specific shares value (as a decimal string). */
  convertToAssetsFor?: Record<string, bigint>;
  /** Override `previewDeposit(assets)` for a specific assets value (as a decimal string). */
  previewDepositFor?: Record<string, bigint>;
};

/**
 * A programmable `VaultRpc` for scenarios that need per-argument logic
 * (e.g. the conversion ratio changing with the queried amount), rather
 * than a fixed table of exact-match responses.
 */
export function vaultReader(options: VaultFixtureOptions = {}): VaultRpc {
  const totalAssets = options.totalAssets ?? 1_000_000n;
  const totalSupply = options.totalSupply ?? 1_000_000n;
  const underlyingBalance = options.underlyingBalance ?? totalAssets;
  const convertToAssetsFor = options.convertToAssetsFor ?? {};
  const previewDepositFor = options.previewDepositFor ?? {};

  return {
    async blockNumber() {
      return options.blockNumber ?? 100n;
    },
    async blockHash() {
      return "0xblockhash";
    },
    async call(to, data) {
      if (data === SELECTORS.asset) return options.missingAsset ? null : addressWord(underlyingAsset);
      if (data === SELECTORS.totalAssets) return uintWord(totalAssets);
      if (data === SELECTORS.totalSupply) return uintWord(totalSupply);

      if (data.startsWith(SELECTORS.convertToAssets)) {
        if (options.missingConvertToAssets) return null;
        const shares = BigInt("0x" + data.slice(SELECTORS.convertToAssets.length));
        if (shares === 0n) return uintWord(0n);
        const override = convertToAssetsFor[shares.toString()];
        if (override !== undefined) return uintWord(override);
        return uintWord(totalSupply === 0n ? 0n : (shares * totalAssets) / totalSupply);
      }

      if (data.startsWith(SELECTORS.previewDeposit)) {
        if (options.missingPreviewDeposit) return null;
        const assets = BigInt("0x" + data.slice(SELECTORS.previewDeposit.length));
        if (assets === 0n) return uintWord(0n);
        const override = previewDepositFor[assets.toString()];
        if (override !== undefined) return uintWord(override);
        return uintWord(totalAssets === 0n ? assets : (assets * totalSupply) / totalAssets);
      }

      if (data.startsWith(SELECTORS.previewRedeem)) {
        return options.missingPreviewRedeem ? null : uintWord(0n);
      }

      if (to.toLowerCase() === underlyingAsset.toLowerCase() && data.startsWith(SELECTORS.balanceOf)) {
        return uintWord(underlyingBalance);
      }

      return uintWord(0n);
    },
  };
}
