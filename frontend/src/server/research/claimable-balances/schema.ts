import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const claimableRequestSchema = z.object({
  walletAddress: z.string().refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account").optional(),
  network: z.enum(["stellar-testnet", "stellar-pubnet"]),
  walletNetwork: z.enum(["stellar-testnet", "stellar-pubnet"]),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  maxPages: z.coerce.number().int().min(1).max(5).default(3),
  knownBalanceIds: z.array(z.string().regex(/^[0-9a-fA-F]{64,72}$/)).max(20).default([]),
}).superRefine((value, context) => { if (value.network !== value.walletNetwork) context.addIssue({ code: "custom", path: ["network"], message: "Network does not match connected wallet" }); });

export type PredicateNode = { kind: "unconditional" } | { kind: "abs_before"; epochSeconds: string } | { kind: "rel_before"; seconds: string } | { kind: "and" | "or"; children: PredicateNode[] } | { kind: "not"; child: PredicateNode };
export type Truth = true | false | "unknown";
export type Eligibility = "eligible" | "ineligible" | "unknown" | "unavailable";
export type ClaimableItem = { id: string; asset: string; amount: string; sponsor: string | null; observationLedger: number; observationTime: string; predicate: PredicateNode | null; predicateResult: Truth; trustlineState: "authorized" | "missing" | "unknown" | "not_required"; eligibility: Eligibility; reasons: string[]; provenance: string };
export type ClaimableResult = { walletAddress: string; network: string; state: "complete" | "partial" | "unavailable"; generatedAt: string; observation: { ledger: number | null; closeTime: string | null; source: string | null }; items: ClaimableItem[]; disappearedIds: string[]; coverage: { pagesRead: number; recordsRead: number; duplicatePage: boolean; truncated: boolean; message: string }; warnings: string[] };
