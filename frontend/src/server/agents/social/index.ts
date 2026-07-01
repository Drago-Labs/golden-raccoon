import type { AgentFinding, AgentResult, AgentSource, RiskLevel } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";

type SocialAgentInput = {
  query?: string;
  symbol?: string;
  tokenName?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
};

type SocialMetadata = {
  url: string;
  title?: string;
  description?: string;
  reachable: boolean;
};

const riskKeywords = [
  "airdrop",
  "claim",
  "free",
  "giveaway",
  "presale",
  "guaranteed",
  "100x",
  "1000x",
  "moon",
  "pump",
  "private sale",
  "connect wallet",
  "seed phrase",
];

const scamKeywords = ["scam", "rug", "phishing", "fake", "impersonation", "drainer", "honeypot"];
const qualityKeywords = ["docs", "documentation", "audit", "github", "whitepaper", "team", "community"];

function normalizeUrl(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());

    return url.toString();
  } catch {
    return undefined;
  }
}

function extractMeta(html: string, property: string) {
  const propertyMatch = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"));
  const nameMatch = html.match(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"));

  return propertyMatch?.[1] ?? nameMatch?.[1];
}

function extractTitle(html: string) {
  return extractMeta(html, "og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim();
}

function extractDescription(html: string) {
  return extractMeta(html, "og:description") ?? extractMeta(html, "description");
}

async function fetchMetadata(url: string): Promise<SocialMetadata> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "GoldenRaccoonBot/1.0",
    },
    next: { revalidate: 60 * 15 },
  });

  if (!response.ok) {
    throw new Error(`Metadata request failed with ${response.status}`);
  }

  const html = await response.text();

  return {
    url,
    title: extractTitle(html),
    description: extractDescription(html),
    reachable: true,
  };
}

function textOf(metadata: SocialMetadata[]) {
  return metadata.map((item) => `${item.title ?? ""} ${item.description ?? ""} ${item.url}`).join(" ").toLowerCase();
}

function countMatches(text: string, keywords: string[]) {
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

function getTwitterHandle(twitterUrl?: string, query?: string) {
  const candidate = twitterUrl ?? query;

  if (!candidate) {
    return undefined;
  }

  const match = candidate.match(/(?:x\.com|twitter\.com)\/([^/?#]+)/i) ?? candidate.match(/^@?([a-zA-Z0-9_]{2,30})$/);

  return match?.[1]?.replace("@", "");
}

function severityFromCount(count: number, mediumAt: number, highAt: number): RiskLevel {
  if (count >= highAt) return "high";
  if (count >= mediumAt) return "medium";
  return "low";
}

function buildFindings(input: SocialAgentInput, metadata: SocialMetadata[]): AgentFinding[] {
  const text = textOf(metadata);
  const handle = getTwitterHandle(input.twitterUrl, input.query);
  const riskKeywordCount = countMatches(text, riskKeywords);
  const scamKeywordCount = countMatches(text, scamKeywords);
  const qualityKeywordCount = countMatches(text, qualityKeywords);
  const hasWebsite = Boolean(normalizeUrl(input.websiteUrl));
  const hasTwitter = Boolean(normalizeUrl(input.twitterUrl) || handle);
  const hasTelegram = Boolean(normalizeUrl(input.telegramUrl));

  return [
    {
      label: "Official social links",
      severity: hasWebsite && hasTwitter ? "low" : hasTwitter || hasWebsite ? "medium" : "high",
      detail: `Website ${hasWebsite ? "present" : "missing"}, X/Twitter ${hasTwitter ? "present" : "missing"}, Telegram ${hasTelegram ? "present" : "missing"}.`,
    },
    {
      label: "Phishing and giveaway language",
      severity: severityFromCount(riskKeywordCount, 2, 5),
      detail: `${riskKeywordCount} hype/giveaway/wallet-connection keyword${riskKeywordCount === 1 ? "" : "s"} found in reachable metadata.`,
    },
    {
      label: "Scam keyword mentions",
      severity: severityFromCount(scamKeywordCount, 1, 2),
      detail: `${scamKeywordCount} scam/rug/phishing/fake keyword${scamKeywordCount === 1 ? "" : "s"} found in reachable metadata.`,
    },
    {
      label: "Project substance signals",
      severity: qualityKeywordCount >= 2 ? "low" : qualityKeywordCount === 1 ? "medium" : "high",
      detail: `${qualityKeywordCount} docs/audit/team/github/whitepaper signal${qualityKeywordCount === 1 ? "" : "s"} found in reachable metadata.`,
    },
    {
      label: "Engagement quality",
      severity: "medium",
      detail: "Live follower, reply, like and bot-cluster metrics require an X API or social-data provider. No engagement values were invented.",
    },
  ];
}

function scoreSocialRisk(findings: AgentFinding[]) {
  const severityScore = {
    low: 18,
    medium: 50,
    high: 80,
    critical: 94,
  };
  const weighted = findings.reduce(
    (total, finding) => {
      const label = finding.label.toLowerCase();
      const weight = label.includes("phishing") || label.includes("scam") ? 1.45 : label.includes("official") ? 1.2 : 1;

      return {
        score: total.score + severityScore[finding.severity] * weight,
        weight: total.weight + weight,
      };
    },
    { score: 0, weight: 0 },
  );

  return Math.round(weighted.score / weighted.weight);
}

export async function runSocialAgent(input: SocialAgentInput): Promise<AgentResult> {
  const urls = [normalizeUrl(input.websiteUrl), normalizeUrl(input.twitterUrl), normalizeUrl(input.telegramUrl)].filter((url): url is string => Boolean(url));
  const metadataResults = await Promise.allSettled(urls.map(fetchMetadata));
  const metadata = metadataResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const findings = buildFindings(input, metadata);
  const score = scoreSocialRisk(findings);
  const sources: AgentSource[] = [
    ...urls.map((url, index): AgentSource => {
      const connected = metadataResults[index]?.status === "fulfilled";

      return {
        label: url.includes("twitter.com") || url.includes("x.com") ? "X/Twitter metadata" : url.includes("t.me") ? "Telegram metadata" : "Website metadata",
        url,
        status: connected ? "connected" : "unavailable",
        detail: connected ? "Public metadata fetched." : "Metadata unavailable or blocked.",
      };
    }),
    {
      label: "Engagement provider",
      status: "unavailable",
      detail: "Follower quality, bot clusters, reply quality and shill density need X API, Apify, Tavily or another provider.",
    },
  ];

  return buildAgentResult({
    agent: "social",
    score,
    verdict: score >= 70 ? "Social risk needs review" : score >= 40 ? "Social signal incomplete" : "No major social metadata risk",
    summary:
      metadata.length > 0
        ? `Social Agent checked ${metadata.length} reachable public metadata source${metadata.length === 1 ? "" : "s"}.`
        : "Social Agent found no reachable public metadata source; live social-provider integration is still required.",
    findings,
    sources,
    confidence: metadata.length > 0 ? 0.52 : 0.28,
    recommendedAction: score >= 70 ? "manual_review" : score >= 40 ? "watch" : "hold",
  });
}
