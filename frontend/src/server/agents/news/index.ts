import type { AgentFinding, AgentResult, AgentSource, RiskLevel } from "@/server/types";
import { buildAgentResult } from "@/server/agents/shared";

type NewsAgentInput = {
  tokenName?: string;
  symbol?: string;
  contractAddress?: string;
};

type NewsFeed = {
  label: string;
  url: string;
  reliability: number;
};

type NewsItem = {
  title: string;
  link?: string;
  description?: string;
  publishedAt?: Date;
  source: string;
  reliability: number;
};

const newsFeeds: NewsFeed[] = [
  {
    label: "CoinDesk",
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    reliability: 0.86,
  },
  {
    label: "Cointelegraph",
    url: "https://cointelegraph.com/rss",
    reliability: 0.78,
  },
  {
    label: "The Block",
    url: "https://www.theblock.co/rss.xml",
    reliability: 0.82,
  },
];

const positiveKeywords = [
  "listing",
  "listed",
  "partnership",
  "integrates",
  "integration",
  "funding",
  "raises",
  "launch",
  "mainnet",
  "airdrop",
  "etf",
  "approval",
];

const negativeKeywords = [
  "hack",
  "exploit",
  "drain",
  "stolen",
  "lawsuit",
  "charged",
  "arrest",
  "probe",
  "investigation",
  "halt",
  "delist",
  "bankrupt",
];

const scamKeywords = ["rug", "scam", "honeypot", "phishing", "fraud", "ponzi", "fake", "impersonation"];
const regulatoryKeywords = ["sec", "cftc", "regulator", "regulatory", "sanction", "compliance", "lawsuit"];
const exchangeKeywords = ["binance", "coinbase", "kraken", "okx", "bybit", "upbit", "listing", "delist"];

function decodeXml(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTag(itemXml: string, tag: string) {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));

  return match ? stripHtml(decodeXml(match[1])) : undefined;
}

function parseFeedItems(xml: string, feed: NewsFeed): NewsItem[] {
  const itemBlocks = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi), (match) => match[0]);
  const entryBlocks = itemBlocks.length > 0 ? itemBlocks : Array.from(xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi), (match) => match[0]);

  return entryBlocks
    .flatMap((itemXml) => {
      const title = extractTag(itemXml, "title");
      const description = extractTag(itemXml, "description") ?? extractTag(itemXml, "summary") ?? extractTag(itemXml, "content");
      const link = extractTag(itemXml, "link") ?? itemXml.match(/<link[^>]*href="([^"]+)"/i)?.[1];
      const pubDate = extractTag(itemXml, "pubDate") ?? extractTag(itemXml, "published") ?? extractTag(itemXml, "updated");
      const publishedAt = pubDate ? new Date(pubDate) : undefined;

      if (!title) {
        return [];
      }

      const item: NewsItem = {
        title,
        source: feed.label,
        reliability: feed.reliability,
      };

      if (link) {
        item.link = link;
      }

      if (description) {
        item.description = description;
      }

      if (publishedAt && !Number.isNaN(publishedAt.getTime())) {
        item.publishedAt = publishedAt;
      }

      return [item];
    });
}

async function fetchFeed(feed: NewsFeed): Promise<NewsItem[]> {
  const response = await fetch(feed.url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
    },
    next: { revalidate: 60 * 10 },
  });

  if (!response.ok) {
    throw new Error(`${feed.label} RSS failed with ${response.status}`);
  }

  return parseFeedItems(await response.text(), feed);
}

function getSearchTerms(input: NewsAgentInput) {
  return [input.symbol, input.tokenName, input.contractAddress]
    .filter((term): term is string => Boolean(term?.trim()))
    .map((term) => term.trim().toLowerCase());
}

function itemText(item: NewsItem) {
  return `${item.title} ${item.description ?? ""}`.toLowerCase();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function dedupeItems(items: NewsItem[]) {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = (item.link || item.title).toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function filterRelevantItems(items: NewsItem[], terms: string[]) {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  return dedupeItems(items)
    .filter((item) => {
      const text = itemText(item);
      const isRecent = !item.publishedAt || now - item.publishedAt.getTime() <= sevenDaysMs;

      return isRecent && terms.some((term) => text.includes(term));
    })
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, 12);
}

function severityFromCount(count: number, mediumAt: number, highAt: number): RiskLevel {
  if (count >= highAt) return "high";
  if (count >= mediumAt) return "medium";
  return "low";
}

function buildNewsFindings(items: NewsItem[]): AgentFinding[] {
  if (items.length === 0) {
    return [
      {
        label: "News coverage",
        severity: "medium",
        detail: "No recent matching RSS coverage found. Thin coverage can be normal for new tokens but requires manual review.",
      },
    ];
  }

  const texts = items.map(itemText);
  const positiveCount = texts.filter((text) => containsAny(text, positiveKeywords)).length;
  const negativeCount = texts.filter((text) => containsAny(text, negativeKeywords)).length;
  const scamCount = texts.filter((text) => containsAny(text, scamKeywords)).length;
  const regulatoryCount = texts.filter((text) => containsAny(text, regulatoryKeywords)).length;
  const exchangeCount = texts.filter((text) => containsAny(text, exchangeKeywords)).length;
  const averageReliability = items.reduce((total, item) => total + item.reliability, 0) / items.length;

  return [
    {
      label: "Positive catalysts",
      severity: positiveCount > 0 ? "low" : "medium",
      detail: `${positiveCount} recent matching item${positiveCount === 1 ? "" : "s"} mention positive catalysts such as listing, funding, launch or partnership.`,
    },
    {
      label: "Negative catalysts",
      severity: severityFromCount(negativeCount, 1, 3),
      detail: `${negativeCount} recent matching item${negativeCount === 1 ? "" : "s"} include negative terms such as hack, exploit, lawsuit, delist or bankruptcy.`,
    },
    {
      label: "Scam or rug mentions",
      severity: severityFromCount(scamCount, 1, 2),
      detail: `${scamCount} recent matching item${scamCount === 1 ? "" : "s"} mention scam/rug/phishing/fraud language.`,
    },
    {
      label: "Regulatory mentions",
      severity: severityFromCount(regulatoryCount, 2, 4),
      detail: `${regulatoryCount} recent matching item${regulatoryCount === 1 ? "" : "s"} mention regulator, SEC/CFTC, sanctions, compliance or lawsuit terms.`,
    },
    {
      label: "Exchange mentions",
      severity: exchangeCount > 0 ? "low" : "medium",
      detail: `${exchangeCount} recent matching item${exchangeCount === 1 ? "" : "s"} mention major exchanges or listing/delist terms.`,
    },
    {
      label: "Source reliability",
      severity: averageReliability >= 0.8 ? "low" : "medium",
      detail: `Average matched-source reliability is ${Math.round(averageReliability * 100)}%.`,
    },
  ];
}

function scoreNewsRisk(findings: AgentFinding[]) {
  const severityScore = {
    low: 18,
    medium: 48,
    high: 78,
    critical: 94,
  };
  const weighted = findings.reduce(
    (total, finding) => {
      const label = finding.label.toLowerCase();
      const weight = label.includes("scam") || label.includes("negative") ? 1.5 : label.includes("regulatory") ? 1.2 : 1;

      return {
        score: total.score + severityScore[finding.severity] * weight,
        weight: total.weight + weight,
      };
    },
    { score: 0, weight: 0 },
  );

  return Math.round(weighted.score / weighted.weight);
}

export async function runNewsAgent(input: NewsAgentInput): Promise<AgentResult> {
  const subject = input.symbol || input.tokenName || input.contractAddress || "token";
  const terms = getSearchTerms(input);

  if (terms.length === 0) {
    return buildAgentResult({
      agent: "news",
      score: 58,
      verdict: "Missing news search input",
      summary: "News Agent needs a token symbol, token name or contract address.",
      findings: [
        {
          label: "News input",
          severity: "medium",
          detail: "Provide tokenName, symbol or contractAddress.",
        },
      ],
      sources: [],
      confidence: 0.25,
      recommendedAction: "manual_review",
    });
  }

  const feedResults = await Promise.allSettled(newsFeeds.map(fetchFeed));
  const items = feedResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const relevantItems = filterRelevantItems(items, terms);
  const findings = buildNewsFindings(relevantItems);
  const score = scoreNewsRisk(findings);
  const sources: AgentSource[] = feedResults.map((result, index) => ({
    label: newsFeeds[index].label,
    url: newsFeeds[index].url,
    status: result.status === "fulfilled" ? "connected" : "unavailable",
    detail:
      result.status === "fulfilled"
        ? `${result.value.length} RSS item${result.value.length === 1 ? "" : "s"} fetched.`
        : "RSS feed unavailable for this request.",
  }));
  const matchedArticleSources: AgentSource[] = relevantItems.slice(0, 5).map((item) => ({
    label: `${item.source}: ${item.title.slice(0, 72)}`,
    url: item.link,
    status: "connected",
    detail: item.publishedAt ? `Matched article published ${item.publishedAt.toISOString()}.` : "Matched article from connected RSS feed.",
  }));

  return buildAgentResult({
    agent: "news",
    score,
    verdict: score >= 70 ? "Negative news risk detected" : score >= 40 ? "News review needed" : "No major news risk",
    summary:
      relevantItems.length > 0
        ? `${subject} matched ${relevantItems.length} recent RSS item${relevantItems.length === 1 ? "" : "s"} across connected crypto news sources.`
        : `${subject} had no recent matching RSS coverage across connected sources.`,
    findings,
    sources: [...sources, ...matchedArticleSources],
    confidence: sources.some((source) => source.status === "connected") ? 0.58 : 0.24,
    recommendedAction: score >= 70 ? "manual_review" : score >= 40 ? "watch" : "hold",
  });
}
