import { isAddress } from "viem";
import { z } from "zod";
import { getEvmNetwork } from "@/lib/evm/config";

export const holderDynamicsRequestSchema = z.object({
  walletAddress: z.string().refine(isAddress, "Invalid wallet"),
  network: z.string().refine((value) => Boolean(getEvmNetwork(value)), "Unsupported network"),
  walletNetwork: z.string(),
  tokenAddress: z.string().refine(isAddress, "Invalid token"),
  fromBlock: z.number().int().positive(),
  toBlock: z.number().int().positive(),
}).refine((value) => value.network === value.walletNetwork, { message: "Network mismatch", path: ["network"] })
  .refine((value) => value.toBlock >= value.fromBlock, { message: "toBlock must be >= fromBlock", path: ["toBlock"] });

export type HolderLabel = "contract" | "zero" | "pool" | "exchange" | "treasury" | "unknown";

export type HolderRow = {
  /** Chain-scoped key: `${network}:${address}` — never combine across chains. */
  key: string;
  network: string;
  address: string;
  balanceRaw: string;
  label: HolderLabel;
  labelEvidence: string;
};

export type Movement = {
  kind: "mint" | "burn" | "transfer" | "indexing_gap";
  fromKey: string | null;
  toKey: string | null;
  amountRaw: string;
  txHash: string | null;
  blockNumber: number;
  note: string;
};

export type HolderDynamicsResult = {
  network: string;
  tokenAddress: string;
  decimals: number;
  fromBlock: number;
  toBlock: number;
  state: "complete" | "partial" | "truncated" | "unavailable" | "non_comparable";
  totalSupplyRaw: string | null;
  observedSupplyRaw: string;
  coverageRatio: number | null;
  topHolderShareBps: number | null;
  top10ShareBps: number | null;
  holders: HolderRow[];
  buckets: Array<{ label: string; holderCount: number; balanceRaw: string }>;
  movements: Movement[];
  warnings: string[];
  scoreUnchanged: true;
};

export type SnapshotReader = {
  getDecimals: () => Promise<number>;
  getTotalSupply: (block: number) => Promise<bigint | null>;
  getHolders: (block: number) => Promise<Array<{ address: string; balance: bigint; code?: boolean }>>;
  getTransfers: (fromBlock: number, toBlock: number) => Promise<Array<{ from: string; to: string; value: bigint; txHash: string; blockNumber: number }>>;
  getBlockHash: (block: number) => Promise<string | null>;
};
