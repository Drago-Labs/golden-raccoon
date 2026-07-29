export function mockTokenScanResult(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "mock-scan-001",
    symbol: "MEME",
    name: "Meme Token",
    chain: "base",
    overallRiskScore: 67,
    summary: "High volatility and concentrated holder distribution detected. Liquidity is moderate.",
    verdict: "caution",
    reasons: [
      "Top 10 holders control 78% of supply",
      "Liquidity is not locked",
      "Social sentiment is elevated but volatile",
    ],
    normalizedInput: {
      query: "0x1234567890abcdef1234567890abcdef12345678",
      chain: "base",
      source: "dex_screener",
      contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
      assetKey: "0x1234567890abcdef1234567890abcdef12345678",
      pairAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    },
    riskBreakdown: [
      { label: "Liquidity", score: 55, maxScore: 100, detail: "Moderate liquidity available" },
      { label: "Ownership", score: 78, maxScore: 100, detail: "Concentrated holders" },
      { label: "Social", score: 42, maxScore: 100, detail: "Mixed sentiment" },
      { label: "Market", score: 65, maxScore: 100, detail: "Average market conditions" },
    ],
    riskReport: {
      buyRisk: 67,
      confidence: 0.72,
      verdict: "caution",
      summary: "High volatility and concentrated holder distribution detected.",
      topReasons: [
        "Top 10 holders control 78% of supply",
        "Liquidity is not locked",
        "Social sentiment is elevated but volatile",
      ],
      agentCards: [
        {
          agent: "onchain",
          displayName: "Onchain Agent",
          score: 72,
          confidence: 0.8,
          scoreKind: "risk",
          summary: "Contract has moderate risk factors.",
          factors: [
            { category: "ownership", label: "Holder concentration", detail: "Top 10 hold 78%", impact: 18, severity: "high", direction: "risk_increase" },
            { category: "liquidity", label: "Liquidity lock", detail: "LP not locked", impact: 12, severity: "high", direction: "risk_increase" },
          ],
          secondaryScores: [
            { label: "Honeypot", score: 15, detail: "No honeypot detected" },
            { label: "Sell tax", score: 8, detail: "Standard sell tax" },
          ],
          criticalFactors: [],
          missingData: [],
        },
        {
          agent: "social",
          displayName: "Social Agent",
          score: 45,
          confidence: 0.6,
          scoreKind: "risk",
          summary: "Social sentiment is elevated but volatile.",
          factors: [
            { category: "sentiment", label: "Social volume", detail: "Above average mentions", impact: 8, severity: "medium", direction: "risk_increase" },
          ],
          secondaryScores: [],
          criticalFactors: [],
          missingData: [],
        },
        {
          agent: "decision",
          displayName: "Decision Agent",
          score: 67,
          confidence: 0.72,
          scoreKind: "risk",
          summary: "Caution advised. Monitor closely.",
          factors: [
            { category: "composite", label: "Composite risk", detail: "Moderate-high overall", impact: 15, severity: "high", direction: "risk_increase" },
            { category: "mitigation", label: "What would change this decision", detail: "A liquidity lock event or significant holder diversification would reduce the risk score." },
          ],
          secondaryScores: [],
          criticalFactors: [],
          missingData: [],
        },
      ],
      executionPreview: {
        title: "Suggested action: Monitor only",
        action: "monitor",
        requiresApproval: true,
        blockedReason: null,
        quote: { status: "not_required" },
        simulation: { status: "unavailable", warnings: [] },
        audit: { serverCanSign: false, authorized: false },
      },
    },
    market: {
      dexId: "Uniswap",
      pairUrl: "https://dexscreener.com/base/0xabcdef",
      liquidityUsd: 2450000,
      volume24hUsd: 890000,
      fdvUsd: 12500000,
      priceChange24hPercent: -3.4,
      pairAgeDays: 45,
      priceUsd: 0.0000123,
    },
    analysisChecks: [
      { key: "deployed", label: "Deployed", status: "pass", score: 10, value: "Yes", reason: "Contract verified on explorer" },
      { key: "honeypot", label: "Honeypot", status: "pass", score: 15, value: "No", reason: "No honeypot detected" },
      { key: "sell_tax", label: "Sell tax", status: "pass", score: 8, value: "5%", reason: "Standard sell tax rate" },
      { key: "ownership", label: "Ownership", status: "danger", score: 78, value: "Concentrated", reason: "Top 10 holders control 78%" },
      { key: "holders", label: "Holders", status: "warning", score: 55, value: "1,234", reason: "Moderate holder count" },
      { key: "liquidity", label: "Liquidity", status: "warning", score: 50, value: "$2.45M", reason: "Adequate liquidity" },
      { key: "lp_lock", label: "LP lock", status: "danger", score: 72, value: "Not locked", reason: "LP tokens are not locked" },
      { key: "market", label: "Market", status: "pass", score: 35, value: "Active", reason: "Market is active" },
    ],
    dataQuality: {
      mode: "live",
      connectedSources: 3,
      unavailableSources: 1,
      mockSources: 0,
      detail: "Data sourced from live providers.",
    },
    ...overrides,
  };
}

export function mockStellarTokenScanResult(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "mock-scan-stellar-001",
    symbol: "RST",
    name: "Risk Stable Token",
    chain: "stellar-testnet",
    overallRiskScore: 23,
    summary: "Low risk profile. Stable asset with transparent operations.",
    verdict: "favorable",
    reasons: [
      "Asset is well distributed across holders",
      "Liquidity is healthy and locked",
      "Team is transparent and doxxed",
    ],
    normalizedInput: {
      query: "CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5",
      chain: "stellar-testnet",
      source: "stellar",
      contractAddress: "CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5",
      assetKey: "CDLZFC3SYJYDZT7K4VJHRJ6J3Z5H3KJY3J3Z5H3KJY3J3Z5H3KJY3J3Z5",
    },
    riskBreakdown: [
      { label: "Liquidity", score: 15, maxScore: 100, detail: "Strong liquidity" },
      { label: "Ownership", score: 10, maxScore: 100, detail: "Well distributed" },
      { label: "Social", score: 30, maxScore: 100, detail: "Neutral sentiment" },
      { label: "Market", score: 25, maxScore: 100, detail: "Stable market" },
    ],
    riskReport: {
      buyRisk: 23,
      confidence: 0.88,
      verdict: "favorable",
      summary: "Low risk profile.",
      topReasons: [
        "Asset is well distributed",
        "Liquidity is healthy",
        "Team is transparent",
      ],
      agentCards: [
        {
          agent: "decision",
          displayName: "Decision Agent",
          score: 23,
          confidence: 0.88,
          scoreKind: "risk",
          summary: "Favorable risk assessment.",
          factors: [
            { category: "composite", label: "Composite risk", detail: "Low overall risk", impact: -10, severity: "low", direction: "risk_decrease" },
          ],
          secondaryScores: [],
          criticalFactors: [],
          missingData: [],
        },
      ],
      executionPreview: null,
    },
    market: null,
    analysisChecks: [
      { key: "trustline", label: "Trustline", status: "pass", score: 5, value: "Established", reason: "Trustline is established" },
      { key: "liquidity", label: "Liquidity", status: "pass", score: 15, value: "$5.2M", reason: "Sufficient liquidity" },
      { key: "holders", label: "Holders", status: "pass", score: 10, value: "8,456", reason: "Well distributed" },
      { key: "market", label: "Market", status: "pass", score: 25, value: "Stable", reason: "Stable market conditions" },
    ],
    dataQuality: {
      mode: "live",
      connectedSources: 2,
      unavailableSources: 0,
      mockSources: 0,
      detail: "Data sourced from live providers.",
    },
    ...overrides,
  };
}

export function mockPortfolioSnapshot(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
    riskScore: 42,
    totalValueUsd: 125000,
    holdings: [
      {
        symbol: "MEME",
        name: "Meme Token",
        tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
        chainId: "base",
        chainName: "Base",
        riskScore: 67,
        allocationPercent: 25,
        valueUsd: 31250,
        signals: { liquidityRisk: 45, ownershipRisk: 78, socialRisk: 42, marketRisk: 65 },
      },
      {
        symbol: "USDC",
        name: "USD Coin",
        tokenAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
        chainId: "base",
        chainName: "Base",
        riskScore: 5,
        allocationPercent: 40,
        valueUsd: 50000,
        signals: { liquidityRisk: 2, ownershipRisk: 5, socialRisk: 3, marketRisk: 4 },
      },
      {
        symbol: "ETH",
        name: "Ethereum",
        tokenAddress: "0xdead000000000000000000000000000000000000",
        chainId: "base",
        chainName: "Base",
        riskScore: 15,
        allocationPercent: 35,
        valueUsd: 43750,
        signals: { liquidityRisk: 8, ownershipRisk: 10, socialRisk: 15, marketRisk: 20 },
      },
    ],
    ...overrides,
  };
}

export function mockAgentResult(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    agent: "portfolio",
    score: 42,
    confidence: 0.85,
    verdict: "balanced",
    summary: "Portfolio is moderately balanced with some concentrated risk.",
    recommendedAction: "rebalance",
    factors: [
      { label: "Diversification", detail: "MEME concentration is high", impact: -15, direction: "risk_increase" },
      { label: "Stable reserve", detail: "40% in stablecoins", impact: 20, direction: "risk_decrease" },
    ],
    dataQuality: {
      mode: "live",
      connectedSources: 2,
      unavailableSources: 0,
      mockSources: 0,
      detail: "Data from live providers.",
    },
    ...overrides,
  };
}

export function mockDefaultRules(): Record<string, number> {
  return {
    maxRiskScore: 70,
    maxTradePercent: 25,
    maxMemeExposurePercent: 15,
  };
}
