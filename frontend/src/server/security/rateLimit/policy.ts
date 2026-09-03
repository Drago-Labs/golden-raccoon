export type RateLimitProfile = {
  namespace: string;
  limit: number;
  windowMs: number;
};

export type RouteRateLimitPolicy = RateLimitProfile & {
  profile?: keyof typeof rateLimitProfiles;
};

export const rateLimitProfiles = {
  tokenScan: { namespace: "scan:token", limit: 25, windowMs: 60_000 },
  portfolioReview: { namespace: "agent:portfolio", limit: 30, windowMs: 60_000 },
  executionPrepare: { namespace: "execute:prepare", limit: 20, windowMs: 60_000 },
  historyRead: { namespace: "history", limit: 80, windowMs: 60_000 },
  expensiveProviderCall: { namespace: "provider:expensive", limit: 10, windowMs: 60_000 },
  alertRead: { namespace: "alert:read", limit: 80, windowMs: 60_000 },
  alertRuleWrite: { namespace: "alert:write", limit: 30, windowMs: 60_000 },
  alertAcknowledge: { namespace: "alert:ack", limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitProfile>;

export const HEALTH_PROBE_PATHS = ["/api/health", "/api/portfolio/health"] as const;

type RouteRule = {
  match: RegExp;
  methods?: string[];
  policy: RouteRateLimitPolicy;
};

const routeRules: RouteRule[] = [
  { match: /^\/api\/scan\/token$/, policy: { ...rateLimitProfiles.tokenScan, profile: "tokenScan" } },
  { match: /^\/api\/agents\/portfolio$/, policy: { ...rateLimitProfiles.portfolioReview, profile: "portfolioReview" } },
  { match: /^\/api\/agents\/onchain$/, policy: { namespace: "agent:onchain", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/agents\/social$/, policy: { namespace: "agent:social", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/agents\/news$/, policy: { namespace: "agent:news", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/agents\/execution$/, policy: { namespace: "agent:execution", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/agents\/decision$/, policy: { namespace: "agent:decision", limit: 40, windowMs: 60_000 } },
  { match: /^\/api\/agent\/decision$/, policy: { namespace: "agent:decision", limit: 40, windowMs: 60_000 } },
  { match: /^\/api\/agent\/analyze$/, policy: { namespace: "agent:analyze", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/x402\/deep-scan$/, policy: { namespace: "x402:deep-scan", limit: 10, windowMs: 60_000, profile: "expensiveProviderCall" } },
  { match: /^\/api\/x402\/stellar-deep-scan$/, policy: { namespace: "x402:stellar-deep-scan", limit: 10, windowMs: 60_000, profile: "expensiveProviderCall" } },
  { match: /^\/api\/x402\/terms$/, policy: { namespace: "x402:terms", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/execute\/prepare$/, policy: { ...rateLimitProfiles.executionPrepare, profile: "executionPrepare" } },
  { match: /^\/api\/execute\/submit$/, policy: { namespace: "execute:submit", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/execute\/quote$/, policy: { namespace: "execute:quote", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/execute\/approve$/, policy: { namespace: "execute:approve", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/execute\/confirm$/, policy: { namespace: "execute:confirm", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/execute\/reject$/, policy: { namespace: "execute:reject", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/execute\/transactions\/[^/]+$/, policy: { namespace: "execute:transaction-status", limit: 120, windowMs: 60_000 } },
  { match: /^\/api\/discovery\/scan$/, policy: { namespace: "discovery:scan", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/discovery\/classify$/, policy: { namespace: "discovery:classify", limit: 25, windowMs: 60_000 } },
  { match: /^\/api\/discovery\/candidates$/, policy: { namespace: "discovery:candidates", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/portfolio$/, policy: { namespace: "portfolio", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/portfolio\/stress$/, policy: { namespace: "portfolio-stress", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/transactions$/, policy: { namespace: "transactions", limit: 80, windowMs: 60_000 } },
  { match: /^\/api\/history\/transactions$/, policy: { namespace: "history:transactions", limit: 80, windowMs: 60_000 } },
  { match: /^\/api\/history\/trends$/, policy: { namespace: "history:trends", limit: 80, windowMs: 60_000 } },
  { match: /^\/api\/history\/recommendations$/, policy: { namespace: "history:recommendations", limit: 80, windowMs: 60_000 } },
  { match: /^\/api\/history\/approvals$/, policy: { namespace: "history:approvals", limit: 80, windowMs: 60_000 } },
  { match: /^\/api\/history\/approvals\/[^/]+$/, policy: { namespace: "history:approval-detail", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/history\/agent-runs$/, methods: ["GET"], policy: { namespace: "history:agent-runs", limit: 80, windowMs: 60_000 } },
  { match: /^\/api\/history\/agent-runs$/, methods: ["POST"], policy: { namespace: "history:agent-runs:create", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/history\/agent-runs\/[^/]+$/, policy: { namespace: "history:agent-run-detail", limit: 80, windowMs: 60_000 } },
  { match: /^\/api\/snapshots$/, methods: ["POST"], policy: { namespace: "risk-snapshots:create", limit: 10, windowMs: 60_000 } },
  { match: /^\/api\/snapshots\/[^/]+\/revoke$/, policy: { namespace: "risk-snapshots:revoke", limit: 10, windowMs: 60_000 } },
  { match: /^\/api\/snapshots\/[^/]+$/, policy: { namespace: "risk-snapshots:read", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/watchlist$/, methods: ["GET"], policy: { namespace: "watchlist:list", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/watchlist$/, methods: ["POST"], policy: { namespace: "watchlist:add", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/watchlist\/import$/, policy: { namespace: "watchlist:import", limit: 10, windowMs: 60_000 } },
  { match: /^\/api\/watchlist\/export$/, policy: { namespace: "watchlist:export", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/watchlist\/[^/]+\/rescan$/, policy: { namespace: "watchlist:rescan", limit: 15, windowMs: 60_000 } },
  { match: /^\/api\/wallet-session$/, policy: { ...rateLimitProfiles.alertRuleWrite, profile: "alertRuleWrite" } },
  { match: /^\/api\/wallet-session\/nonce$/, policy: { ...rateLimitProfiles.alertRuleWrite, profile: "alertRuleWrite" } },
  { match: /^\/api\/wallet-privacy\/export$/, policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/wallet-privacy\/audit-export$/, policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/wallet-privacy\/erasure-receipt$/, policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/wallet-privacy\/delete$/, policy: { ...rateLimitProfiles.alertRuleWrite, profile: "alertRuleWrite" } },
  { match: /^\/api\/auto-mode$/, methods: ["GET"], policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/auto-mode$/, methods: ["POST", "PUT", "PATCH", "DELETE"], policy: { ...rateLimitProfiles.alertRuleWrite, profile: "alertRuleWrite" } },
  { match: /^\/api\/auto-mode\/authorization$/, policy: { ...rateLimitProfiles.alertRuleWrite, profile: "alertRuleWrite" } },
  { match: /^\/api\/alerts$/, methods: ["GET"], policy: { namespace: "alerts:list", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/alerts$/, methods: ["POST"], policy: { namespace: "alerts:ack", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/alerts\/rules$/, methods: ["GET"], policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/alerts\/rules$/, methods: ["POST", "PUT", "PATCH", "DELETE"], policy: { ...rateLimitProfiles.alertRuleWrite, profile: "alertRuleWrite" } },
  { match: /^\/api\/alerts\/deliveries$/, methods: ["GET"], policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/alerts\/deliveries$/, methods: ["POST"], policy: { ...rateLimitProfiles.alertAcknowledge, profile: "alertAcknowledge" } },
  { match: /^\/api\/alerts\/observations$/, policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/alerts\/observations\/[^/]+$/, policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/alerts\/alerts$/, policy: { ...rateLimitProfiles.alertRead, profile: "alertRead" } },
  { match: /^\/api\/alerts\/alerts\/[^/]+\/acknowledge$/, policy: { ...rateLimitProfiles.alertAcknowledge, profile: "alertAcknowledge" } },
  { match: /^\/api\/rules$/, methods: ["GET"], policy: { namespace: "rules", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/rules$/, methods: ["POST", "PUT", "PATCH", "DELETE"], policy: { namespace: "rules:update", limit: 20, windowMs: 60_000 } },
  { match: /^\/api\/recovery$/, policy: { namespace: "recovery:list", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/recovery\/status$/, policy: { namespace: "recovery:status", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/recovery\/trustline$/, policy: { namespace: "recovery:trustline", limit: 12, windowMs: 60_000 } },
  { match: /^\/api\/recovery\/allowance$/, policy: { namespace: "recovery:allowance", limit: 12, windowMs: 60_000 } },
  { match: /^\/api\/recovery\/confirm$/, policy: { namespace: "recovery:confirm", limit: 12, windowMs: 60_000 } },
  { match: /^\/api\/recovery\/revoke$/, policy: { namespace: "recovery:revoke", limit: 10, windowMs: 60_000 } },
  { match: /^\/api\/recovery\/pause$/, policy: { namespace: "recovery:pause", limit: 10, windowMs: 60_000 } },
  { match: /^\/api\/recovery\/incident$/, policy: { namespace: "recovery:incident", limit: 6, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/registry\/verify$/, policy: { namespace: "stellar:registry:verify", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/registry\/submit$/, policy: { namespace: "stellar:registry:submit", limit: 15, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/registry\/preview$/, policy: { namespace: "stellar:registry:preview", limit: 15, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/registry\/prepare$/, policy: { namespace: "stellar:registry:prepare", limit: 15, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/registry\/history$/, policy: { namespace: "stellar:registry:history", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/registry\/status$/, policy: { namespace: "stellar:registry:status", limit: 60, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/registry\/record$/, policy: { namespace: "stellar:registry:record", limit: 30, windowMs: 60_000 } },
  { match: /^\/api\/stellar\/governance\/pending$/, policy: { namespace: "stellar:governance:pending", limit: 30, windowMs: 60_000 } },
];

const defaultApiPolicy: RouteRateLimitPolicy = {
  namespace: "api:default",
  limit: 120,
  windowMs: 60_000,
};

export function isHealthProbePath(pathname: string) {
  return (HEALTH_PROBE_PATHS as readonly string[]).includes(pathname);
}

export function resolveRoutePolicy(pathname: string, method = "GET"): RouteRateLimitPolicy | null {
  if (isHealthProbePath(pathname)) return null;

  const normalizedMethod = method.toUpperCase();
  for (const rule of routeRules) {
    if (!rule.match.test(pathname)) continue;
    if (rule.methods && !rule.methods.includes(normalizedMethod)) continue;
    return rule.policy;
  }

  if (pathname.startsWith("/api/")) {
    return defaultApiPolicy;
  }

  return null;
}
