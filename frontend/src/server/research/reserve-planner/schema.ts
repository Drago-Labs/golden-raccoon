import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const reserveScenarioSchema = z.object({
  action: z.enum(["none", "add_trustline", "remove_trustline", "add_entry", "remove_entry", "sponsor_entry", "end_sponsoring", "receive_sponsorship", "remove_sponsored"]).default("none"),
  count: z.coerce.number().int().min(0).max(20).default(1),
});

export const reservePlannerRequestSchema = z.object({
  walletAddress: z.string().refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account address").optional(),
  network: z.enum(["stellar-testnet", "stellar-pubnet"]),
  walletNetwork: z.enum(["stellar-testnet", "stellar-pubnet"]),
  feeAllowanceStroops: z.coerce.bigint().nonnegative().max(100_000_000n).default(100_000n),
  scenario: reserveScenarioSchema.default({ action: "none", count: 1 }),
}).superRefine((value, context) => {
  if (value.walletNetwork && value.walletNetwork !== value.network) context.addIssue({ code: "custom", path: ["network"], message: "Selected network does not match the connected wallet" });
});

export type ReservePlannerRequest = z.infer<typeof reservePlannerRequestSchema>;
export type ReserveScenario = z.infer<typeof reserveScenarioSchema>;
export type ReserveState = "complete" | "partial" | "unavailable";
export type ReserveCounters = { subentryCount: number; numSponsoring: number; numSponsored: number };

export type ReserveBreakdown = {
  balanceStroops: string;
  baseAccountReserveStroops: string;
  subentryReserveStroops: string;
  sponsoringReserveStroops: string;
  sponsoredReserveCreditStroops: string;
  minimumReserveStroops: string;
  sellingLiabilitiesStroops: string;
  feeAllowanceStroops: string;
  spendableStroops: string;
  shortfallStroops: string;
  reconciliationStroops: string;
};

export type ReservePlannerResult = {
  walletAddress: string;
  network: "stellar-testnet" | "stellar-pubnet";
  state: ReserveState;
  generatedAt: string;
  observation: { ledger: number | null; source: string | null; checkedAt: string; consistent: boolean };
  baseReserveStroops: string | null;
  beforeCounters: ReserveCounters | null;
  afterCounters: ReserveCounters | null;
  before: ReserveBreakdown | null;
  after: ReserveBreakdown | null;
  scenario: ReserveScenario;
  warnings: string[];
  unsupportedEntryTypes: string[];
};
