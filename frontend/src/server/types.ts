export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AgentStatus =
  | "idle"
  | "running"
  | "complete"
  | "partial"
  | "warning"
  | "error"
  | "unavailable"
  | "blocked"
  | "manual_review_required";

export type AgentSource = {
  label: string;
  url?: string;
  status: "mock" | "connected" | "unavailable";
  detail?: string;
  checkedAt?: string;
  latencyMs?: number;
  error?: string;
  errorCode?: string;
  provider?: string;
  fallbackRank?: number;
  cache?: {
    policy: string;
    ttlSeconds: number;
    hit?: boolean;
    freshnessSeconds?: number;
  };
  reliability?: number;
};

export type SourceDataQuality = {
  mode: "live" | "partial" | "unavailable" | "stale" | "conflicting";
  connectedSources: number;
  unavailableSources: number;
  mockSources: number;
  sourceCount: number;
  reliability: number;
  lastCheckedAt?: string;
  freshnessSeconds?: number;
  averageLatencyMs?: number;
  conflictCount?: number;
  providerErrors?: Array<{
    label: string;
    code?: string;
    detail?: string;
  }>;
  cache?: {
    policy: string;
    hitCount: number;
    missCount: number;
    staleCount: number;
  };
  detail: string;
};

export type AgentFinding = {
  label: string;
  severity: RiskLevel;
  detail: string;
  scoreImpact?: number;
  weight?: number;
  sourceLabel?: string;
  raw?: string;
  interpretation?: string;
  confidence?: number;
};

export type AgentRecommendedAction =
  | "hold"
  | "watch"
  | "reduce_exposure"
  | "swap_to_stable"
  | "avoid"
  | "manual_review"
  | "prepare_transaction"
  | "no_action";

export type AgentResult = {
  agent: "portfolio" | "news" | "social" | "onchain" | "decision" | "execution";
  status: AgentStatus;
  riskScore: number;
  score: number;
  riskLevel: RiskLevel;
  verdict: string;
  summary: string;
  findings: AgentFinding[];
  sources: AgentSource[];
  dataQuality: SourceDataQuality;
  confidence: number;
  recommendedAction: AgentRecommendedAction;
  blockingReasons: string[];
  blockingReasonDetails?: AgentBlockingReason[];
  missingData: AgentMissingData[];
  rawSignals?: Record<string, unknown>;
  createdAt: string;
};

export type AgentMissingData = {
  field: string;
  reason: string;
  impact: "low" | "medium" | "high";
  requiredFor?: string;
  canRetry?: boolean;
  fallbackUsed?: boolean;
};

export type AgentBlockingReason = {
  category: "critical" | "policy" | "identity" | "provider_coverage" | "simulation";
  severity: RiskLevel;
  detail: string;
  sourceLabel?: string;
};

export type AgentInputIdentity = {
  walletAddress?: string;
  chain?: string;
  contractAddress?: string;
  symbol?: string;
  tokenName?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  discordUrl?: string;
  coingeckoId?: string;
  coinmarketcapId?: string;
  pairAddress?: string;
  dexScreenerPairUrl?: string;
};

export type ResolvedTokenIdentity = AgentInputIdentity & {
  identityKey: string;
  confidence: number;
  confidenceLabel: "low" | "medium" | "high";
  matchReasons: string[];
  warnings: string[];
  identityGraph?: unknown;
  symbolCollision?: unknown;
  officialLinkVerification?: unknown;
};

export type TokenSignal = {
  scamRisk: number;
  websiteTrustRisk: number;
  contractRisk: number;
  whaleSellRisk: number;
  liquidityRisk: number;
  xSentimentRisk: number;
  holderConcentrationRisk: number;
  priceVolatilityRisk: number;
  portfolioExposureRisk: number;
};

export type TokenHolding = {
  tokenAddress: string;
  symbol: "GOAT" | "USDC" | "MEME" | string;
  name: string;
  chainId?: string;
  chainName?: string;
  chainLogoUrl?: string;
  logoUrl?: string;
  isVerified?: boolean;
  balance: number;
  priceUsd: number;
  valueUsd: number;
  dayChangeUsd?: number;
  dayChangePercent?: number;
  allocationPercent: number;
  riskScore: number;
  riskLevel: RiskLevel;
  signals: TokenSignal;
};

export type PortfolioSnapshot = {
  walletAddress: string;
  nativeBalance: number;
  nativeSymbol: string;
  dayChangePercent: number;
  dayChangeUsd?: number;
  totalValueUsd: number;
  riskScore: number;
  createdAt: string;
  holdings: TokenHolding[];
};

export type AgentStep = {
  key: "observe" | "analyze" | "decide" | "plan" | "act";
  label: string;
  status: "complete" | "pending";
  detail: string;
};

export type SuggestedAction = {
  type: "swap_to_stablecoin" | "hold" | "reduce_exposure";
  fromToken: string;
  toToken: string;
  percent: number;
};

export type AgentDecision = {
  walletAddress: string;
  summary: string;
  riskScore: number;
  decision: string;
  reasoning: string[];
  suggestedAction: SuggestedAction;
  confidence: number;
  status: "pending" | "approved" | "rejected" | "executed";
  txHash?: string;
  createdAt: string;
};

export type TransactionPreview = {
  title: string;
  action?: "swap" | "reduce_exposure" | "watchlist" | "no_action";
  fromToken?: string;
  toToken?: string;
  percent?: number;
  estimatedValueUsd: number;
  currentRiskScore: number;
  projectedRiskScore: number;
  requiresApproval: boolean;
  network: string;
  slippageBps?: number;
  priceImpactBps?: number;
  gasEstimateUsd?: number;
  approvalSteps?: string[];
  executionReady?: boolean;
  lifecycle?: {
    status: "prepared" | "user_rejected" | "submitted" | "confirmed" | "failed" | "replaced" | "expired";
    expiresAt?: string;
    idempotencyKey?: string;
  };
  approvalRisk?: {
    infiniteApprovalWarning: boolean;
    existingAllowanceCheck: "required" | "not_required";
    revokeSuggestion?: string;
    permitSupport: "unsupported" | "planned";
    permit2Support: "unsupported" | "planned";
  };
  blockedReason?: string;
  policy?: {
    maxTradePercent: number;
    maxRiskScore: number;
    maxMemeExposurePercent: number;
    maxDailyTransactionValueUsd?: number;
    maxSlippageBps?: number;
    allowedChains?: string[];
    blockedTokens?: string[];
    allowedActions?: AgentRecommendedAction[];
    autoExecute: false;
  };
  policyStatus?: {
    allowed: boolean;
    violations: string[];
  };
  quote?: {
    provider: "planned_dex_aggregator";
    route: string[];
    expectedOutputToken: string;
    expectedOutputAmount?: number;
    estimatedValueUsd: number;
    priceImpactBps: number;
    slippageBps: number;
    gasEstimateUsd: number;
    status: "planned" | "unavailable";
    detail: string;
  };
  simulation?: {
    provider: "planned_tenderly" | "not_required";
    status: "not_required" | "pending" | "passed" | "failed" | "unavailable";
    checks: string[];
    revertReason?: string;
    detail: string;
  };
  audit?: {
    approvalRequired: boolean;
    serverCanSign: false;
    userRuleWallet?: string;
    userApproved?: boolean;
    decisionId?: string;
  };
};

export type UserRule = {
  walletAddress: string;
  maxRiskScore: number;
  maxTradePercent: number;
  maxMemeExposurePercent: number;
  maxDailyTransactionValueUsd?: number;
  maxSlippageBps?: number;
  allowedChains?: string[];
  blockedTokens?: string[];
  allowedActions?: AgentRecommendedAction[];
  autoExecute: boolean;
  createdAt: string;
};

export type RiskBreakdownItem = {
  key:
    | "scam"
    | "website"
    | "contract"
    | "liquidity"
    | "whales"
    | "xSentiment"
    | "holders"
    | "volatility"
    | "portfolioExposure";
  label: string;
  score: number;
  severity: RiskLevel;
  finding: string;
};

export type ScanSource = {
  label: string;
  status: "mock" | "connected" | "unavailable";
  detail: string;
};

export type RiskReportVerdict = "buy_small" | "watch" | "avoid" | "hold" | "reduce_exposure" | "manual_review";

export type ScoreFactorCategory =
  | "sellability"
  | "owner_controls"
  | "taxes"
  | "liquidity"
  | "holder_concentration"
  | "lp_lock"
  | "market_anomaly"
  | "creator_behavior"
  | "social_identity"
  | "social_engagement"
  | "phishing"
  | "news_catalyst"
  | "news_risk"
  | "portfolio_exposure"
  | "source_coverage"
  | "decision_logic";

export type ScoreFactor = {
  label: string;
  category: ScoreFactorCategory;
  impact: number;
  weight?: number;
  severity: RiskLevel;
  detail: string;
  sourceLabel?: string;
  direction: "risk_increase" | "risk_decrease" | "neutral";
  raw?: unknown;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

export type AgentScoreCard = {
  agent: AgentResult["agent"];
  displayName: string;
  score: number;
  scoreKind: "risk" | "trust" | "signal" | "exposure" | "decision";
  confidence: number;
  status: AgentStatus;
  summary: string;
  factors: ScoreFactor[];
  criticalFactors?: ScoreFactor[];
  secondaryScores?: Array<{
    label: string;
    score: number;
    detail: string;
  }>;
  sources: AgentSource[];
  missingData: AgentMissingData[];
};

export type RiskReportInput = {
  query: string;
  chain: string;
  contractAddress?: string;
  pairAddress?: string;
  pairUrl?: string;
  symbol?: string;
  tokenName?: string;
  source: "contract_address" | "dexscreener_pair_url" | "dexscreener_token_url" | "unresolved";
};

export type RiskReport = {
  id: string;
  chain: string;
  contractAddress?: string;
  symbol: string;
  tokenName?: string;
  buyRisk: number;
  confidence: number;
  verdict: RiskReportVerdict;
  summary: string;
  topReasons: string[];
  input: RiskReportInput;
  agentCards: AgentScoreCard[];
  sources: AgentSource[];
  missingData: AgentMissingData[];
  executionPreview?: TransactionPreview;
  createdAt: string;
};

export type TokenScanResult = {
  symbol: string;
  tokenAddress: string;
  chain: string;
  normalizedInput?: RiskReportInput;
  market?: {
    pairAddress?: string;
    dexId?: string;
    pairUrl?: string;
    priceUsd?: number;
    liquidityUsd?: number;
    volume24hUsd?: number;
    fdvUsd?: number;
    marketCapUsd?: number;
    priceChange24hPercent?: number;
    pairAgeDays?: number;
  };
  overallRiskScore: number;
  opportunityScore: number;
  verdict: "safe" | "watch" | "high_risk" | "critical";
  summary: string;
  reasons: string[];
  suggestedAction: SuggestedAction;
  riskBreakdown: RiskBreakdownItem[];
  riskReport?: RiskReport;
  sources: ScanSource[];
  dataQuality?: SourceDataQuality;
  scannedAt: string;
};

export type TransactionRecord = {
  hash: string;
  type: "swap" | "approval" | "agent_log" | "transfer";
  decisionAction?: AgentRecommendedAction;
  asset: string;
  valueUsd: number;
  status: "prepared" | "user_rejected" | "submitted" | "confirmed" | "failed" | "replaced" | "expired" | "pending";
  createdAt: string;
  network: string;
  walletAddress?: string;
  userApproved?: boolean;
  decisionId?: string;
  simulationStatus?: NonNullable<TransactionPreview["simulation"]>["status"];
  policyStatus?: TransactionPreview["policyStatus"];
};

export type AgentRunRecord = {
  id: string;
  walletAddress: string;
  mode?: "portfolio_review" | "token_scan" | "pre_buy_check" | "holding_review" | "execution_prepare";
  inputSnapshot?: Record<string, unknown>;
  targetToken?: {
    symbol?: string;
    name?: string;
    tokenAddress?: string;
    chain?: string;
    riskScore?: number;
    allocationPercent?: number;
  };
  status: "completed" | "partial" | "failed";
  recommendation: AgentRecommendedAction;
  decisionScore: number;
  confidence: number;
  summary: string;
  results: AgentResult[];
  sourceStatuses?: Array<{
    agent: AgentResult["agent"];
    connected: number;
    unavailable: number;
    mock: number;
  }>;
  userAction?: "pending" | "approved" | "rejected" | "adjusted" | "executed";
  createdAt: string;
};

export type StorageProvider = "memory" | "supabase_postgres";

export type StorageHealth = {
  provider: StorageProvider;
  persistent: boolean;
  detail: string;
  schema?: {
    tables: string[];
    adapterApi: string[];
    migration: string;
  };
};

export type X402PaymentReceipt = {
  id: string;
  requestId: string;
  paymentHeaderHash: string;
  walletAddress?: string;
  payer?: string;
  transactionHash?: string;
  network: string;
  asset: string;
  amount: string;
  priceUsd: string;
  payTo: string;
  facilitatorUrl: string;
  protectedResource: string;
  requestBodyHash: string;
  verificationStatus: "payment_required" | "verified" | "settled" | "failed" | "duplicate" | "expired";
  createdAt: string;
  updatedAt: string;
};

export type RecommendationRecord = {
  id: string;
  runId?: string;
  walletAddress: string;
  action: AgentRecommendedAction;
  decisionScore: number;
  confidence: number;
  summary: string;
  createdAt: string;
};

export type UserApprovalRecord = {
  id: string;
  walletAddress: string;
  decisionId?: string;
  txHash: string;
  network?: string;
  action?: AgentRecommendedAction;
  asset?: string;
  valueUsd?: number;
  status: "confirmed";
  autoExecuted: false;
  createdAt: string;
};

export type StorageCounts = {
  agentRuns: number;
  recommendations: number;
  transactions: number;
  approvals: number;
  userRules: number;
  x402PaymentReceipts: number;
};
