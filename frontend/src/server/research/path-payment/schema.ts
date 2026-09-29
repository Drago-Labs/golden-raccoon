import { StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const assetKeySchema = z.string().min(1).max(200);

export const pathPaymentRequestSchema = z
  .object({
    walletAddress: z
      .string()
      .refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account")
      .optional(),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    walletNetwork: z.enum(["stellar-testnet", "stellar-pubnet"]),
    mode: z.enum(["strict_send", "strict_receive"]),
    sourceAsset: assetKeySchema,
    destinationAsset: assetKeySchema,
    amount: z.string().regex(/^\d+(\.\d{1,7})?$/, "Expected a non-negative decimal amount"),
    sourceAccount: z
      .string()
      .refine((value) => StrKey.isValidEd25519PublicKey(value), "Expected a Stellar account")
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.network !== value.walletNetwork) {
      context.addIssue({ code: "custom", path: ["network"], message: "Network does not match connected wallet" });
    }
  });

export type VenueType = "orderbook" | "pool" | "unknown";

export type PathHop = {
  index: number;
  fromAssetKey: string;
  toAssetKey: string;
  inputAmount: string;
  outputAmount: string;
  venue: VenueType;
  note: string;
};

export type RouteFailure =
  | "none"
  | "no_path"
  | "missing_trustline"
  | "insufficient_source_balance"
  | "expired_quote"
  | "stale_quote"
  | "incomplete_simulation"
  | "provider_failure";

export type PathRoute = {
  id: string;
  hops: PathHop[];
  sourceAmount: string;
  destinationAmount: string;
  estimated: boolean;
  simulated: boolean;
  failure: RouteFailure;
  warnings: string[];
};

export type PathPaymentResult = {
  walletAddress: string;
  network: "stellar-testnet" | "stellar-pubnet";
  mode: "strict_send" | "strict_receive";
  state: "complete" | "partial" | "unavailable";
  generatedAt: string;
  observation: { ledger: number | null; closeTime: string | null; source: string | null; quoteAgeSeconds: number | null };
  sourceAssetKey: string;
  destinationAssetKey: string;
  routes: PathRoute[];
  primaryFailure: RouteFailure;
  coverageMessage: string;
  warnings: string[];
};
