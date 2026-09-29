import { isAddress } from "viem";
import { z } from "zod";
import { getEvmNetwork } from "@/lib/evm/config";

export const proxyRequestSchema = z.object({
  walletAddress: z.string().refine(isAddress, "Invalid wallet"),
  network: z.string().refine((v) => Boolean(getEvmNetwork(v)), "Unsupported network"),
  walletNetwork: z.string(),
  contractAddress: z.string().refine(isAddress, "Invalid contract"),
  blockNumber: z.number().int().positive().optional(),
}).refine((v) => v.network === v.walletNetwork, { message: "Network mismatch", path: ["network"] });

export type Observation = { kind: "code" | "slot" | "call"; address: string; detail: string; ok: boolean };
export type ProxyNode = { address: string; role: "proxy" | "implementation" | "beacon"; code: boolean };
export type ProxyResult = { network: string; blockNumber: number | null; state: "complete" | "partial" | "empty" | "unavailable"; classification: string; nodes: ProxyNode[]; edges: { from: string; to: string; kind: string }[]; authority: { address: string | null; conclusion: string }; observations: Observation[]; warnings: string[] };
