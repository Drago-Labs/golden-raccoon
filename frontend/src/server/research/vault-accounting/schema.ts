import { isAddress } from "viem";
import { z } from "zod";
import { isSupportedVaultNetwork } from "./chainIdentity";
import { MAX_SAMPLE_AMOUNTS } from "./limits";
import type { VaultAccountingState } from "./errors";

const uintStringSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Must be a positive integer, in the asset's smallest unit");

export const vaultAccountingRequestSchema = z
  .object({
    walletAddress: z.string().refine(isAddress, "Invalid wallet"),
    network: z.string().refine(isSupportedVaultNetwork, "Unsupported network"),
    walletNetwork: z.string(),
    vaultAddress: z.string().refine(isAddress, "Invalid vault address"),
    /** Recorded block to read at; defaults to latest when omitted. */
    blockNumber: z.number().int().positive().optional(),
    /** Deposit amounts (in the underlying asset's smallest unit) to check rounding for. */
    sampleAmounts: z.array(uintStringSchema).max(MAX_SAMPLE_AMOUNTS).default([]),
  })
  .refine((v) => v.network === v.walletNetwork, {
    message: "Network mismatch",
    path: ["network"],
  });

export type VaultAccountingRequest = z.infer<typeof vaultAccountingRequestSchema>;

export type VaultFunctionName =
  | "asset"
  | "totalAssets"
  | "totalSupply"
  | "convertToAssets"
  | "previewDeposit"
  | "previewRedeem";

export type VaultConformance = {
  conforming: boolean;
  missing: VaultFunctionName[];
};

/** Assets-per-share, expressed as an integer scaled by `SHARE_PRICE_SCALE`. */
export type SharePrice = {
  assetsPerShareScaled: string;
  scale: string;
};

export type RoundingSampleDirection = "favors_vault" | "favors_depositor" | "exact" | "unavailable";

export type RoundingSample = {
  /** Original deposit amount, in the asset's smallest unit. */
  amount: string;
  sharesFromDeposit: string | null;
  /** `convertToAssets(sharesFromDeposit)` — the round-trip assets value. */
  assetsRoundTrip: string | null;
  /** `amount - assetsRoundTrip`. Positive means the depositor got back less than they put in. */
  lossRaw: string | null;
  direction: RoundingSampleDirection;
};

export type UnderlyingBalanceComparison = {
  totalAssets: string | null;
  /** The vault's own ERC-20 balance of its underlying asset. */
  actualBalance: string | null;
  /** `totalAssets - actualBalance`, floored at 0. Assets the contract claims but doesn't directly hold. */
  assetsElsewhere: string | null;
  /** `actualBalance < totalAssets`: the vault directly holds less than it claims. */
  deficit: boolean;
};

export type SharePricePoint = {
  blockNumber: number;
  sharePrice: SharePrice | null;
};

export type SharePriceJump = {
  fromBlock: number;
  toBlock: number;
  changeBps: number;
};

export type CoverageNotice = {
  reachedProvider: boolean;
  conformance: VaultConformance;
  roundingSamplesRequested: number;
  roundingSamplesAvailable: number;
  priceSamplesRequested: number;
  priceSamplesAvailable: number;
};

export type VaultAccountingResult = {
  network: string;
  vaultAddress: string;
  blockNumber: number | null;
  state: VaultAccountingState;
  conformance: VaultConformance;
  asset: string | null;
  totalAssets: string | null;
  totalSupply: string | null;
  sharePrice: SharePrice | null;
  roundingSamples: RoundingSample[];
  underlyingBalance: UnderlyingBalanceComparison | null;
  priceSamples: SharePricePoint[];
  priceJumps: SharePriceJump[];
  coverage: CoverageNotice;
  warnings: string[];
};
