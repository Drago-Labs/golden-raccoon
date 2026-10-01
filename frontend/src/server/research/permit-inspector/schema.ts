import { isAddress } from "viem";
import { z } from "zod";
import { getEvmNetwork } from "@/lib/evm/config";

export const permitRequestSchema = z
  .object({
    walletAddress: z.string().refine(isAddress, "Invalid wallet"),
    network: z.string().refine((v) => Boolean(getEvmNetwork(v)), "Unsupported network"),
    walletNetwork: z.string(),
    tokenAddress: z.string().refine(isAddress, "Invalid token address"),
    ownerAddress: z.string().refine(isAddress, "Invalid owner address"),
    /** Optional: only needed to look up a Permit2 allowance for one spender. */
    spenderAddress: z.string().refine(isAddress, "Invalid spender address").optional(),
    blockNumber: z.number().int().positive().optional(),
  })
  .refine((v) => v.network === v.walletNetwork, { message: "Network mismatch", path: ["network"] });

export type PermitRequest = z.infer<typeof permitRequestSchema>;

export type Eip2612Evidence = {
  supported: boolean;
  name: string | null;
  /** Non-standard but common; many EIP-2612 tokens do not expose it separately. */
  version: string | null;
  domainSeparator: string | null;
  nonce: string | null;
};

export type Permit2Evidence = {
  checked: boolean;
  spenderAddress: string | null;
  amount: string | null;
  expiration: number | null;
  nonce: number | null;
};

export type PermitResult = {
  network: string;
  chainId: number | null;
  blockNumber: number | null;
  tokenAddress: string;
  ownerAddress: string;
  state: "complete" | "partial" | "unavailable";
  eip2612: Eip2612Evidence | null;
  permit2: Permit2Evidence | null;
  warnings: string[];
};
