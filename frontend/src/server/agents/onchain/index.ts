import { isAddress } from "viem";
import type { AgentFinding, AgentResult, AgentSource } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";

type OnchainAgentInput = {
  chain?: string;
  contractAddress?: string;
};

type ChainConfig = {
  goPlusChainId?: string;
  dexScreenerChainId: string;
  covalentChainId?: string;
};

type GoPlusTokenSecurity = Record<string, string | undefined>;

type GoPlusTokenSecurityResponse = {
  code?: number;
  message?: string;
  result?: Record<string, GoPlusTokenSecurity>;
};

type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  priceUsd?: string;
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  priceChange?: {
    h24?: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
};

type CreatorActivity = {
  creatorAddress?: string;
  ownerAddress?: string;
  creatorPercent?: number;
  ownerPercent?: number;
  dexTransferCount?: number;
  dexTransferValueUsd?: number;
  checked: boolean;
};

type CovalentTransferResponse = {
  data?: {
    items?: Array<{
      transfers?: Array<{
        from_address?: string;
        to_address?: string;
        contract_address?: string;
        quote?: number | null;
        delta_quote?: number | null;
        block_signed_at?: string;
      }>;
    }>;
  };
};

const chainConfigs: Record<string, ChainConfig> = {
  ethereum: { goPlusChainId: "1", dexScreenerChainId: "ethereum", covalentChainId: "eth-mainnet" },
  eth: { goPlusChainId: "1", dexScreenerChainId: "ethereum", covalentChainId: "eth-mainnet" },
  "eth-mainnet": { goPlusChainId: "1", dexScreenerChainId: "ethereum", covalentChainId: "eth-mainnet" },
  bsc: { goPlusChainId: "56", dexScreenerChainId: "bsc", covalentChainId: "bsc-mainnet" },
  bnb: { goPlusChainId: "56", dexScreenerChainId: "bsc", covalentChainId: "bsc-mainnet" },
  "bnb chain": { goPlusChainId: "56", dexScreenerChainId: "bsc", covalentChainId: "bsc-mainnet" },
  "bsc-mainnet": { goPlusChainId: "56", dexScreenerChainId: "bsc", covalentChainId: "bsc-mainnet" },
  arbitrum: { goPlusChainId: "42161", dexScreenerChainId: "arbitrum", covalentChainId: "arbitrum-mainnet" },
  "arbitrum-mainnet": { goPlusChainId: "42161", dexScreenerChainId: "arbitrum", covalentChainId: "arbitrum-mainnet" },
  polygon: { goPlusChainId: "137", dexScreenerChainId: "polygon", covalentChainId: "matic-mainnet" },
  "matic-mainnet": { goPlusChainId: "137", dexScreenerChainId: "polygon", covalentChainId: "matic-mainnet" },
  base: { goPlusChainId: "8453", dexScreenerChainId: "base", covalentChainId: "base-mainnet" },
  "base-mainnet": { goPlusChainId: "8453", dexScreenerChainId: "base", covalentChainId: "base-mainnet" },
  linea: { goPlusChainId: "59144", dexScreenerChainId: "linea", covalentChainId: "linea-mainnet" },
  "linea-mainnet": { goPlusChainId: "59144", dexScreenerChainId: "linea", covalentChainId: "linea-mainnet" },
  optimism: { goPlusChainId: "10", dexScreenerChainId: "optimism", covalentChainId: "optimism-mainnet" },
  "optimism-mainnet": { goPlusChainId: "10", dexScreenerChainId: "optimism", covalentChainId: "optimism-mainnet" },
  avalanche: { goPlusChainId: "43114", dexScreenerChainId: "avalanche", covalentChainId: "avalanche-mainnet" },
  "avalanche-mainnet": { goPlusChainId: "43114", dexScreenerChainId: "avalanche", covalentChainId: "avalanche-mainnet" },
};

function normalizeChain(chain?: string) {
  return (chain || "goat").trim().toLowerCase();
}

function isFlagged(value?: string) {
  return value === "1" || value?.toLowerCase() === "true";
}

function parseTax(value?: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed * 100 : 0;
}

function parsePercent(value?: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return parsed > 1 ? parsed : parsed * 100;
}

function getCreatorAddress(security?: GoPlusTokenSecurity) {
  return security?.creator_address || security?.deployer_address || security?.owner_address;
}

function getOwnerAddress(security?: GoPlusTokenSecurity) {
  return security?.owner_address;
}

function sameAddress(left?: string, right?: string) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function getBestPair(pairs?: DexScreenerPair[]) {
  if (!pairs || pairs.length === 0) {
    return undefined;
  }

  return [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

async function fetchGoPlusSecurity(chainId: string, contractAddress: string) {
  const url = new URL(`https://api.gopluslabs.io/api/v1/token_security/${chainId}`);
  url.searchParams.set("contract_addresses", contractAddress);

  const headers: HeadersInit = {};
  const apiKey = process.env.GOPLUS_API_KEY;

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    headers,
    next: { revalidate: 60 * 10 },
  });

  if (!response.ok) {
    throw new Error(`GoPlus request failed with ${response.status}`);
  }

  const payload = (await response.json()) as GoPlusTokenSecurityResponse;
  const result = payload.result?.[contractAddress.toLowerCase()] ?? payload.result?.[contractAddress];

  if (!result) {
    throw new Error(payload.message || "GoPlus returned no token security result");
  }

  return result;
}

async function fetchDexScreenerPairs(chainId: string, contractAddress: string) {
  const response = await fetch(`https://api.dexscreener.com/tokens/v1/${chainId}/${contractAddress}`, {
    next: { revalidate: 60 * 5 },
  });

  if (!response.ok) {
    throw new Error(`DexScreener request failed with ${response.status}`);
  }

  return (await response.json()) as DexScreenerPair[];
}

async function fetchCreatorActivity(
  chainConfig: ChainConfig,
  security: GoPlusTokenSecurity | undefined,
  contractAddress: string,
  pairs: DexScreenerPair[] | undefined,
): Promise<CreatorActivity | undefined> {
  const creatorAddress = getCreatorAddress(security);
  const ownerAddress = getOwnerAddress(security);
  const creatorPercent = parsePercent(security?.creator_percent);
  const ownerPercent = parsePercent(security?.owner_percent);
  const bestPair = getBestPair(pairs);
  const pairAddress = bestPair?.pairAddress;
  const apiKey = process.env.GOLDRUSH_API_KEY ?? process.env.COVALENT_API_KEY;

  if (!creatorAddress) {
    return {
      ownerAddress,
      creatorPercent,
      ownerPercent,
      checked: false,
    };
  }

  if (!apiKey || !chainConfig.covalentChainId) {
    return {
      creatorAddress,
      ownerAddress,
      creatorPercent,
      ownerPercent,
      checked: false,
    };
  }

  const url = new URL(`https://api.covalenthq.com/v1/${chainConfig.covalentChainId}/address/${creatorAddress}/transfers_v2/`);
  url.searchParams.set("contract-address", contractAddress);
  url.searchParams.set("no-spam", "true");
  url.searchParams.set("page-size", "100");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    next: { revalidate: 60 * 10 },
  });

  if (!response.ok) {
    throw new Error(`Creator transfer request failed with ${response.status}`);
  }

  const payload = (await response.json()) as CovalentTransferResponse;
  const transfers = (payload.data?.items ?? []).flatMap((item) => item.transfers ?? []);
  const dexTransfers = transfers.filter((transfer) => {
    if (!sameAddress(transfer.from_address, creatorAddress)) {
      return false;
    }

    if (pairAddress && sameAddress(transfer.to_address, pairAddress)) {
      return true;
    }

    return Boolean(transfer.to_address && transfer.to_address !== creatorAddress && (transfer.quote ?? transfer.delta_quote ?? 0) > 0);
  });

  return {
    creatorAddress,
    ownerAddress,
    creatorPercent,
    ownerPercent,
    dexTransferCount: dexTransfers.length,
    dexTransferValueUsd: dexTransfers.reduce((total, transfer) => total + (transfer.quote ?? transfer.delta_quote ?? 0), 0),
    checked: true,
  };
}

function buildSecurityFindings(security?: GoPlusTokenSecurity): AgentFinding[] {
  if (!security) {
    return [
      {
        label: "Contract security",
        severity: "medium",
        detail: "GoPlus data is unavailable, so contract risk needs manual review.",
      },
    ];
  }

  const buyTax = parseTax(security.buy_tax);
  const sellTax = parseTax(security.sell_tax);
  const criticalFlags = [
    ["Honeypot", security.is_honeypot],
    ["Cannot sell all", security.cannot_sell_all],
    ["Blacklist", security.is_blacklisted],
    ["Owner balance change", security.owner_change_balance],
  ].filter(([, value]) => isFlagged(value));
  const permissionFlags = [
    ["Mint permission", security.is_mintable],
    ["Pause permission", security.transfer_pausable],
    ["Proxy contract", security.is_proxy],
    ["Hidden owner", security.hidden_owner],
  ].filter(([, value]) => isFlagged(value));

  return [
    {
      label: "Critical contract flags",
      severity: criticalFlags.length > 0 ? "critical" : "low",
      detail: criticalFlags.length > 0 ? criticalFlags.map(([label]) => label).join(", ") : "No critical GoPlus flags detected.",
    },
    {
      label: "Owner permissions",
      severity: permissionFlags.length > 0 ? "high" : "low",
      detail: permissionFlags.length > 0 ? permissionFlags.map(([label]) => label).join(", ") : "No elevated owner permission flags detected.",
    },
    {
      label: "Buy/sell tax",
      severity: buyTax >= 10 || sellTax >= 10 ? "high" : buyTax > 0 || sellTax > 0 ? "medium" : "low",
      detail: `Buy tax ${buyTax.toFixed(2)}%, sell tax ${sellTax.toFixed(2)}%.`,
    },
  ];
}

function buildLiquidityFindings(pairs?: DexScreenerPair[]): AgentFinding[] {
  if (!pairs || pairs.length === 0) {
    return [
      {
        label: "Liquidity",
        severity: "high",
        detail: "No DexScreener pairs were found for this token.",
      },
    ];
  }

  const bestPair = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
  const liquidityUsd = bestPair.liquidity?.usd ?? 0;
  const volume24h = bestPair.volume?.h24 ?? 0;
  const priceChange24h = bestPair.priceChange?.h24 ?? 0;
  const pairAgeDays = bestPair.pairCreatedAt ? Math.floor((Date.now() - bestPair.pairCreatedAt) / 86_400_000) : null;

  return [
    {
      label: "Liquidity",
      severity: liquidityUsd < 25_000 ? "high" : liquidityUsd < 100_000 ? "medium" : "low",
      detail: `Best pair liquidity is $${Math.round(liquidityUsd).toLocaleString("en-US")}.`,
    },
    {
      label: "24h volume",
      severity: volume24h < 10_000 ? "medium" : "low",
      detail: `24h DEX volume is $${Math.round(volume24h).toLocaleString("en-US")}.`,
    },
    {
      label: "Pair age and volatility",
      severity: (pairAgeDays !== null && pairAgeDays < 7) || Math.abs(priceChange24h) >= 25 ? "high" : "low",
      detail: `Pair age ${pairAgeDays === null ? "unknown" : `${pairAgeDays} days`}; 24h price change ${priceChange24h.toFixed(2)}%.`,
    },
  ];
}

function buildCreatorFindings(activity?: CreatorActivity): AgentFinding[] {
  if (!activity) {
    return [
      {
        label: "Creator wallet activity",
        severity: "medium",
        detail: "Creator/deployer wallet activity could not be checked.",
      },
    ];
  }

  const creatorPercent = activity.creatorPercent;
  const ownerPercent = activity.ownerPercent;
  const dexTransferCount = activity.dexTransferCount ?? 0;
  const dexTransferValueUsd = activity.dexTransferValueUsd ?? 0;
  const lowCreatorRetention = typeof creatorPercent === "number" && creatorPercent < 1;
  const lowOwnerRetention = typeof ownerPercent === "number" && ownerPercent < 1;

  if (!activity.checked) {
    return [
      {
        label: "Creator wallet activity",
        severity: lowCreatorRetention || lowOwnerRetention ? "high" : "medium",
        detail:
          activity.creatorAddress
            ? `Creator ${activity.creatorAddress} detected, but transfer history provider is unavailable. Creator holds ${creatorPercent?.toFixed(2) ?? "unknown"}%; owner holds ${ownerPercent?.toFixed(2) ?? "unknown"}%.`
            : "Creator/deployer address was not available from the security provider.",
      },
    ];
  }

  return [
    {
      label: "Creator wallet selling",
      severity: dexTransferCount > 0 ? "high" : lowCreatorRetention || lowOwnerRetention ? "medium" : "low",
      detail:
        dexTransferCount > 0
          ? `Creator wallet sent token value toward DEX/pair-related addresses ${dexTransferCount} time${dexTransferCount === 1 ? "" : "s"}; estimated transfer value ${Math.round(dexTransferValueUsd).toLocaleString("en-US")} USD.`
          : `No creator-to-DEX token transfer found in the sampled transfer history. Creator holds ${creatorPercent?.toFixed(2) ?? "unknown"}%; owner holds ${ownerPercent?.toFixed(2) ?? "unknown"}%.`,
    },
  ];
}

function scoreFindings(findings: AgentFinding[]) {
  const severityScore = {
    low: 18,
    medium: 48,
    high: 76,
    critical: 94,
  };

  return Math.round(findings.reduce((total, finding) => total + severityScore[finding.severity], 0) / findings.length);
}

export async function runOnchainAgent(input: OnchainAgentInput): Promise<AgentResult> {
  const chain = normalizeChain(input.chain);
  const contractAddress = input.contractAddress?.trim();
  const chainConfig = chainConfigs[chain];

  if (!contractAddress || !isAddress(contractAddress)) {
    return buildAgentResult({
      agent: "onchain",
      score: 88,
      verdict: "Missing or invalid contract address",
      summary: "A valid EVM contract address is required before onchain security and liquidity checks can run.",
      findings: [
        {
          label: "Contract address",
          severity: "critical",
          detail: "Provide a valid 0x contract address.",
        },
      ],
      sources: [],
      confidence: 0.25,
      recommendedAction: "avoid",
    });
  }

  if (!chainConfig) {
    return buildAgentResult({
      agent: "onchain",
      score: 72,
      verdict: "Unsupported chain for automated checks",
      summary: `${chain} is not mapped to GoPlus/DexScreener yet. Manual review is required.`,
      findings: [
        {
          label: "Chain support",
          severity: "high",
          detail: "Add this chain to the onchain agent mapping before trusting automated checks.",
        },
      ],
      sources: [],
      confidence: 0.28,
      recommendedAction: "manual_review",
    });
  }

  const [securityResult, pairsResult] = await Promise.allSettled([
    chainConfig.goPlusChainId ? fetchGoPlusSecurity(chainConfig.goPlusChainId, contractAddress) : Promise.resolve(undefined),
    fetchDexScreenerPairs(chainConfig.dexScreenerChainId, contractAddress),
  ]);
  const security = securityResult.status === "fulfilled" ? securityResult.value : undefined;
  const pairs = pairsResult.status === "fulfilled" ? pairsResult.value : undefined;
  const creatorActivity = await fetchCreatorActivity(chainConfig, security, contractAddress, pairs).catch(() => undefined);
  const findings = [...buildSecurityFindings(security), ...buildLiquidityFindings(pairs), ...buildCreatorFindings(creatorActivity)];
  const score = scoreFindings(findings);
  const sources: AgentSource[] = [
    {
      label: "GoPlus token security",
      status: security ? "connected" : "unavailable",
      detail: security ? "Contract permission and honeypot flags returned." : "GoPlus data unavailable for this request.",
    },
    {
      label: "DexScreener token pairs",
      status: pairs ? "connected" : "unavailable",
      detail: pairs ? `${pairs.length} pair${pairs.length === 1 ? "" : "s"} returned.` : "DEX pair data unavailable for this request.",
    },
    {
      label: "Creator transfer history",
      status: creatorActivity?.checked ? "connected" : "unavailable",
      detail: creatorActivity?.checked
        ? "Creator wallet transfer sample returned from GoldRush/Covalent."
        : "Creator sell check requires creator address plus GoldRush/Covalent transfer history.",
    },
  ];

  return buildAgentResult({
    agent: "onchain",
    score,
    verdict: score >= 85 ? "Critical onchain risk" : score >= 70 ? "High onchain risk" : score >= 40 ? "Onchain review needed" : "No major onchain flags",
    summary: `Checked ${contractAddress} on ${chainConfig.dexScreenerChainId}. Security and liquidity signals produced ${findings.length} findings.`,
    findings,
    sources,
    confidence: security && pairs ? 0.74 : security || pairs ? 0.52 : 0.3,
    recommendedAction: score >= 85 ? "avoid" : score >= 70 ? "manual_review" : score >= 40 ? "watch" : "hold",
  });
}
