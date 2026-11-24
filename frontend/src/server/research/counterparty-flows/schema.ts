import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import type { CounterpartyState } from "./errors";
import { COUNTERPARTY_FLOW_LIMITS } from "./limits";

export const COUNTERPARTY_FLOW_SCHEMA_VERSION = "counterparty-flows/2026-01" as const;

export type StellarNetwork = "stellar-testnet" | "stellar-pubnet";

export const windowPresets = ["7d", "30d", "90d"] as const;
export type WindowPreset = (typeof windowPresets)[number];

export const counterpartyFlowRequestSchema = z
  .object({
    account: z
      .string()
      .trim()
      .refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account"),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    window: z.enum(windowPresets).default("30d"),
    windowStart: z.string().datetime().optional(),
    windowEnd: z.string().datetime().optional(),
  })
  .superRefine((value, context) => {
    if ((value.windowStart && !value.windowEnd) || (!value.windowStart && value.windowEnd)) {
      context.addIssue({
        code: "custom",
        path: ["windowStart"],
        message: "Custom windows need both windowStart and windowEnd.",
      });
    }
  });

export type CounterpartyFlowRequest = z.infer<typeof counterpartyFlowRequestSchema>;

export type FlowKind = "payment" | "path_payment" | "claim";

export type FlowDirection = "in" | "out";

export type ExactRatio = {
  numerator: string;
  denominator: string;
};

export type FlowEvent = {
  id: string;
  kind: FlowKind;
  direction: FlowDirection;
  counterparty: string;
  asset: string;
  amount: string;
  createdAt: string;
  ledger: number;
};

export type CounterpartyAssetTotal = {
  counterparty: string;
  label: string | null;
  labelEvidence: string | null;
  asset: string;
  direction: FlowDirection;
  amount: string;
  eventCount: number;
};

export type ConcentrationSlice = {
  direction: FlowDirection;
  asset: string;
  defined: boolean;
  counterpartyCount: number;
  totalAmount: string;
  topShares: Array<{ n: number; share: ExactRatio; amount: string }>;
  herfindahl: ExactRatio;
};

export type CounterpartyFlowReport = {
  schemaVersion: typeof COUNTERPARTY_FLOW_SCHEMA_VERSION;
  account: string;
  network: StellarNetwork;
  windowStart: string;
  windowEnd: string;
  state: CounterpartyState;
  totals: CounterpartyAssetTotal[];
  concentration: ConcentrationSlice[];
  eventCount: number;
  historyTruncated: boolean;
  coverageNotice: string;
  readOnly: true;
};

export { COUNTERPARTY_FLOW_LIMITS };
