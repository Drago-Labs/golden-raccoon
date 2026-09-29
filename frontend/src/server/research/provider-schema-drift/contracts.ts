/**
 * Versioned provider response contracts.
 *
 * These describe expected shapes for probes. They do not change runtime adapter
 * implementations — a 200 with renamed fields or shifted units is breaking even
 * when the endpoint is reachable.
 */
import { z } from "zod";

export const CONTRACT_VERSIONS = {
  stellar: "stellar-provider/2026-01",
  evm: "evm-provider/2026-01",
  market: "market-provider/2026-01",
  social: "social-provider/2026-01",
  news: "news-provider/2026-01",
} as const;

export type ProviderKind = keyof typeof CONTRACT_VERSIONS;

const identitySchema = z.object({
  chainId: z.string().min(1),
  address: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
});

export const stellarContract = z.object({
  schemaVersion: z.literal(CONTRACT_VERSIONS.stellar),
  identity: identitySchema,
  balance: z.object({
    amount: z.string().regex(/^\d+$/),
    unit: z.literal("stroops"),
  }),
  observedAt: z.string().datetime({ offset: true }),
});

export const evmContract = z.object({
  schemaVersion: z.literal(CONTRACT_VERSIONS.evm),
  identity: identitySchema,
  balance: z.object({
    amount: z.string().regex(/^\d+$/),
    unit: z.literal("wei"),
  }),
  observedAt: z.string().datetime({ offset: true }),
});

export const marketContract = z.object({
  schemaVersion: z.literal(CONTRACT_VERSIONS.market),
  identity: z.object({
    symbol: z.string().min(1),
    chainId: z.string().min(1),
  }),
  price: z.object({
    amount: z.string().regex(/^\d+(\.\d+)?$/),
    unit: z.literal("usd"),
  }),
  observedAt: z.string().datetime({ offset: true }),
});

export const socialContract = z.object({
  schemaVersion: z.literal(CONTRACT_VERSIONS.social),
  identity: z.object({ handle: z.string().min(1) }),
  metrics: z.object({
    followers: z.number().int().nonnegative(),
    unit: z.literal("accounts"),
  }),
  observedAt: z.string().datetime({ offset: true }),
});

export const newsContract = z.object({
  schemaVersion: z.literal(CONTRACT_VERSIONS.news),
  identity: z.object({ articleId: z.string().min(1) }),
  headline: z.string().min(1),
  publishedAt: z.string().datetime({ offset: true }),
});

export const contracts: Record<ProviderKind, z.ZodTypeAny> = {
  stellar: stellarContract,
  evm: evmContract,
  market: marketContract,
  social: socialContract,
  news: newsContract,
};

/** Paths whose units must not silently change. */
export const UNIT_PATHS: Record<ProviderKind, string[]> = {
  stellar: ["balance.unit"],
  evm: ["balance.unit"],
  market: ["price.unit"],
  social: ["metrics.unit"],
  news: [],
};

/** Paths that identify the subject; rename/removal is semantic identity drift. */
export const IDENTITY_PATHS: Record<ProviderKind, string[]> = {
  stellar: ["identity.chainId", "identity.accountId", "identity.address"],
  evm: ["identity.chainId", "identity.address"],
  market: ["identity.symbol", "identity.chainId"],
  social: ["identity.handle"],
  news: ["identity.articleId"],
};
