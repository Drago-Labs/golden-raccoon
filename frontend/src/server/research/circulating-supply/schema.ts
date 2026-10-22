import { z } from "zod";
import { CIRCULATING_SUPPLY_LIMITS } from "./limits";

export const tokenSchema = z.discriminatedUnion("network", [
  z.object({ network: z.literal("evm"), chainId: z.number().int().positive(), address: z.string().regex(/^0x[a-fA-F0-9]{40}$/), decimals: z.number().int().min(0).max(36).default(18) }),
  z.object({ network: z.literal("stellar"), assetCode: z.string().regex(/^[A-Za-z0-9]{1,12}$/), issuer: z.string().regex(/^G[A-Z2-7]{55}$/), decimals: z.number().int().min(0).max(18).default(7) }),
]);
export const circulatingSupplyRequestSchema = z.object({
  token: tokenSchema,
  observation: z.object({ block: z.number().int().nonnegative().optional(), ledger: z.number().int().nonnegative().optional() }).default({}),
  exclusions: z.array(z.object({ address: z.string().min(1).max(128), reason: z.string().trim().min(3).max(300), evidenceUrl: z.string().url() })).max(CIRCULATING_SUPPLY_LIMITS.maxExclusions),
  reportedSources: z.array(z.object({ name: z.string().trim().min(1).max(80), url: z.string().url(), value: z.string().regex(/^\d+$/), fetchedAt: z.string().datetime() })).max(CIRCULATING_SUPPLY_LIMITS.maxReportedSources),
});
export type CirculatingSupplyRequest = z.infer<typeof circulatingSupplyRequestSchema>;
export type SupplySnapshot = { totalSupply: string; balances: Record<string, string>; observation: number; sourceUrl: string };
export type SupplyComparison = { name: string; sourceUrl: string; fetchedAt: string; reported: string; implied: string; gap: string };
export type CirculatingSupplyReport = { state: "complete" | "partial" | "unavailable"; token: CirculatingSupplyRequest["token"]; totalSupply: string | null; excludedTotal: string; impliedSupply: string | null; exclusions: Array<{ address: string; balance: string; reason: string; evidenceUrl: string }>; comparisons: SupplyComparison[]; observation: number | null; sourceUrl: string | null; coverageNotice: string; readOnly: true };
