export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AgentStatus = "idle" | "running" | "complete" | "warning" | "error" | "unavailable";

export type AgentSource = {
  label: string;
  url?: string;
  status: "mock" | "connected" | "unavailable";
  detail?: string;
};

export type AgentFinding = {
  label: string;
  severity: RiskLevel;
  detail: string;
  sourceLabel?: string;
  raw?: string;
  interpretation?: string;
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
  score: number;
  verdict: string;
  summary: string;
  findings: AgentFinding[];
  sources: AgentSource[];
  confidence: number;
  recommendedAction: AgentRecommendedAction;
  createdAt: string;
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
  approvalSteps?: string[];
  blockedReason?: string;
};

export type UserRule = {
  walletAddress: string;
  maxRiskScore: number;
  maxTradePercent: number;
  maxMemeExposurePercent: number;
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

export type TokenScanResult = {
  symbol: string;
  tokenAddress: string;
  chain: string;
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
  sources: ScanSource[];
  scannedAt: string;
};

export type TransactionRecord = {
  hash: string;
  type: "swap" | "approval" | "agent_log" | "transfer";
  asset: string;
  valueUsd: number;
  status: "pending" | "confirmed" | "failed";
  createdAt: string;
  network: string;
};

export type AgentRunRecord = {
  id: string;
  walletAddress: string;
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
  createdAt: string;
};

export type StorageProvider = "memory" | "supabase_postgres";

export type StorageHealth = {
  provider: StorageProvider;
  persistent: boolean;
  detail: string;
};
