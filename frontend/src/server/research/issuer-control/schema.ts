import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

export const issuerControlRequestSchema = z
  .object({
    walletAddress: z
      .string()
      .refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account")
      .optional(),
    accountAddress: z
      .string()
      .refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account")
      .optional(),
    assetQuery: z.string().trim().min(1).max(200),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    walletNetwork: z.enum(["stellar-testnet", "stellar-pubnet"]),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    maxPages: z.coerce.number().int().min(1).max(5).default(3),
  })
  .superRefine((value, context) => {
    if (value.network !== value.walletNetwork) {
      context.addIssue({ code: "custom", path: ["network"], message: "Network does not match connected wallet" });
    }
  });

export type IssuerControlRequest = z.infer<typeof issuerControlRequestSchema>;

export type AssetKind = "native" | "classic" | "soroban_token" | "unsupported";

export type ResolvedAsset = {
  kind: AssetKind;
  assetKey: string;
  display: string;
  code: string | null;
  issuer: string | null;
  contractId: string | null;
  network: "stellar-testnet" | "stellar-pubnet";
};

export type IssuerFlagSnapshot = {
  state: "observed" | "not_applicable" | "unavailable";
  authRequired: boolean | null;
  authRevocable: boolean | null;
  authImmutable: boolean | null;
  authClawbackEnabled: boolean | null;
  issuerExists: boolean | null;
  issuer: string | null;
  ledger: number | null;
  observedAt: string | null;
  source: string | null;
  note: string;
};

export type TrustlineState =
  | "not_required"
  | "missing"
  | "unauthorized"
  | "authorized_to_maintain_liabilities"
  | "fully_authorized"
  | "unavailable";

export type TrustlineSnapshot = {
  state: TrustlineState;
  balance: string | null;
  limit: string | null;
  buyingLiabilities: string | null;
  sellingLiabilities: string | null;
  account: string;
  assetKey: string;
  ledger: number | null;
  observedAt: string | null;
  source: string | null;
  note: string;
};

export type ControlEventKind =
  | "trustline_created"
  | "trustline_removed"
  | "trustline_updated"
  | "trustline_authorized"
  | "trustline_deauthorized"
  | "trustline_clawed_back"
  | "account_flags_updated"
  | "unknown";

export type ControlEvent = {
  id: string;
  kind: ControlEventKind;
  pagingToken: string;
  account: string | null;
  assetKey: string | null;
  amount: string | null;
  ledger: number | null;
  closedAt: string | null;
  source: string;
  note: string;
};

export type EventCoverage = {
  pagesRead: number;
  recordsRead: number;
  duplicatePage: boolean;
  truncated: boolean;
  message: string;
};

export type IssuerControlResult = {
  walletAddress: string;
  accountAddress: string;
  network: "stellar-testnet" | "stellar-pubnet";
  state: "complete" | "partial" | "unavailable";
  generatedAt: string;
  asset: ResolvedAsset | null;
  observation: { ledger: number | null; closeTime: string | null; source: string | null };
  issuerFlags: IssuerFlagSnapshot;
  trustline: TrustlineSnapshot;
  events: ControlEvent[];
  coverage: EventCoverage;
  warnings: string[];
};
