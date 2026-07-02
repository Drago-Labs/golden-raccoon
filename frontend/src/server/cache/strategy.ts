import { NextResponse } from "next/server";

export type ApiCacheKey =
  | "portfolio"
  | "news"
  | "social"
  | "onchain"
  | "decision"
  | "execution"
  | "history"
  | "scan"
  | "rules"
  | "transactions";

export const apiCacheStrategy: Record<ApiCacheKey, { seconds: number; scope: "private" | "public" | "no-store"; detail: string }> = {
  portfolio: {
    seconds: 45,
    scope: "private",
    detail: "Wallet portfolio snapshots can be reused briefly for the same user.",
  },
  news: {
    seconds: 600,
    scope: "public",
    detail: "RSS news data is cached for 10 minutes.",
  },
  social: {
    seconds: 600,
    scope: "public",
    detail: "Public metadata checks are cached for 10 minutes.",
  },
  onchain: {
    seconds: 900,
    scope: "public",
    detail: "Onchain security and liquidity checks are cached for 15 minutes.",
  },
  decision: {
    seconds: 0,
    scope: "no-store",
    detail: "Decision responses depend on submitted agent results.",
  },
  execution: {
    seconds: 0,
    scope: "no-store",
    detail: "Execution planning and confirmation must never be shared-cacheable.",
  },
  history: {
    seconds: 0,
    scope: "no-store",
    detail: "History is wallet-specific and should be fetched fresh.",
  },
  scan: {
    seconds: 0,
    scope: "no-store",
    detail: "Token scans combine live agent outputs and should be fetched fresh.",
  },
  rules: {
    seconds: 0,
    scope: "no-store",
    detail: "User execution rules are wallet-specific and should be fetched fresh.",
  },
  transactions: {
    seconds: 0,
    scope: "no-store",
    detail: "Transactions are wallet-specific audit records and should be fetched fresh.",
  },
};

export function withCacheHeaders<T>(response: NextResponse<T>, key: ApiCacheKey) {
  const strategy = apiCacheStrategy[key];

  if (strategy.scope === "no-store") {
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  response.headers.set("Cache-Control", `${strategy.scope}, max-age=${strategy.seconds}, stale-while-revalidate=${strategy.seconds}`);

  return response;
}
