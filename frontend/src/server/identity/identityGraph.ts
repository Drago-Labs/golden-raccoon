import type { AgentInputIdentity } from "@/server/types";
import { evaluateUrlSafety, getHostname } from "@/server/security/urlSafety";

export type IdentityGraphNode = {
  id: string;
  type: "contract" | "chain" | "pair" | "symbol" | "name" | "website" | "social" | "directory";
  label: string;
  confidence: "low" | "medium" | "high";
};

export type IdentityGraphEdge = {
  from: string;
  to: string;
  relation: "same_token" | "official_link" | "directory_reference" | "weak_label";
};

export const collisionProneSymbols = new Set(["AI", "GOAT", "PEPE", "MOON", "MEME", "DOGE", "SHIB", "CAT", "WOLF", "PUMP"]);

function normalizeValue(value?: string) {
  return value?.trim();
}

function addNode(nodes: IdentityGraphNode[], node: IdentityGraphNode | undefined) {
  if (!node || nodes.some((existing) => existing.id === node.id)) {
    return;
  }

  nodes.push(node);
}

export function getSymbolCollisionRisk(symbol?: string, contractAddress?: string, chain?: string) {
  const normalized = symbol?.trim().toUpperCase();
  const collisionProne = Boolean(normalized && collisionProneSymbols.has(normalized));
  const weakContext = !contractAddress || !chain;

  return {
    symbol: normalized,
    collisionProne,
    risk: collisionProne && weakContext ? "high" : collisionProne ? "medium" : "low",
    detail: collisionProne
      ? `${normalized} is collision-prone; require contract, chain and official links before high confidence.`
      : "Symbol is not in the collision-prone registry.",
  };
}

export function verifyOfficialLinks(input: AgentInputIdentity) {
  const websiteHost = getHostname(input.websiteUrl);
  const socialHosts = [input.twitterUrl, input.telegramUrl, input.discordUrl].map(getHostname).filter((value): value is string => Boolean(value));
  const dexHost = getHostname(input.dexScreenerPairUrl);
  const urlSafety = [input.websiteUrl, input.twitterUrl, input.telegramUrl, input.discordUrl, input.dexScreenerPairUrl]
    .filter((value): value is string => Boolean(value))
    .map((url) => evaluateUrlSafety(url, websiteHost));
  const mutualLinkAvailable = Boolean(websiteHost && socialHosts.length > 0);
  const dexCompatible = !dexHost || dexHost.includes("dexscreener.com");
  const conflicts = urlSafety.filter((item) => !item.safe).flatMap((item) => item.issues.map((issue) => `${item.hostname ?? item.url}: ${issue}`));

  return {
    websiteHost,
    socialHosts,
    dexHost,
    mutualLinkAvailable,
    dexCompatible,
    contractMentionedInOfficialInput: Boolean(input.contractAddress && (input.websiteUrl || input.twitterUrl || input.telegramUrl || input.discordUrl)),
    conflicts,
    urlSafety,
    confidenceBoost: mutualLinkAvailable && conflicts.length === 0 ? 0.12 : 0,
  };
}

export function buildTokenIdentityGraph(input: AgentInputIdentity) {
  const nodes: IdentityGraphNode[] = [];
  const edges: IdentityGraphEdge[] = [];
  const contract = normalizeValue(input.contractAddress)?.toLowerCase();
  const chain = normalizeValue(input.chain)?.toLowerCase();
  const symbol = normalizeValue(input.symbol)?.toUpperCase();
  const name = normalizeValue(input.tokenName);
  const pair = normalizeValue(input.pairAddress) ?? normalizeValue(input.dexScreenerPairUrl);
  const website = normalizeValue(input.websiteUrl);
  const twitter = normalizeValue(input.twitterUrl);
  const telegram = normalizeValue(input.telegramUrl);
  const discord = normalizeValue(input.discordUrl);
  const coingecko = normalizeValue(input.coingeckoId);
  const coinmarketcap = normalizeValue(input.coinmarketcapId);

  addNode(nodes, contract ? { id: `contract:${contract}`, type: "contract", label: contract, confidence: "high" } : undefined);
  addNode(nodes, chain ? { id: `chain:${chain}`, type: "chain", label: chain, confidence: "high" } : undefined);
  addNode(nodes, pair ? { id: `pair:${pair.toLowerCase()}`, type: "pair", label: pair, confidence: "medium" } : undefined);
  addNode(nodes, symbol ? { id: `symbol:${symbol}`, type: "symbol", label: symbol, confidence: "low" } : undefined);
  addNode(nodes, name ? { id: `name:${name.toLowerCase()}`, type: "name", label: name, confidence: "medium" } : undefined);
  addNode(nodes, website ? { id: `website:${website.toLowerCase()}`, type: "website", label: website, confidence: "high" } : undefined);
  addNode(nodes, twitter ? { id: `social:${twitter.toLowerCase()}`, type: "social", label: twitter, confidence: "medium" } : undefined);
  addNode(nodes, telegram ? { id: `social:${telegram.toLowerCase()}`, type: "social", label: telegram, confidence: "medium" } : undefined);
  addNode(nodes, discord ? { id: `social:${discord.toLowerCase()}`, type: "social", label: discord, confidence: "medium" } : undefined);
  addNode(nodes, coingecko ? { id: `directory:coingecko:${coingecko}`, type: "directory", label: coingecko, confidence: "high" } : undefined);
  addNode(nodes, coinmarketcap ? { id: `directory:coinmarketcap:${coinmarketcap}`, type: "directory", label: coinmarketcap, confidence: "high" } : undefined);

  const anchor = nodes.find((node) => node.type === "contract") ?? nodes.find((node) => node.type === "website") ?? nodes[0];

  if (anchor) {
    for (const node of nodes) {
      if (node.id === anchor.id) continue;

      edges.push({
        from: anchor.id,
        to: node.id,
        relation: node.type === "social" || node.type === "website" ? "official_link" : node.type === "directory" ? "directory_reference" : node.type === "symbol" ? "weak_label" : "same_token",
      });
    }
  }

  return {
    nodes,
    edges,
    collision: getSymbolCollisionRisk(symbol, contract, chain),
    officialLinks: verifyOfficialLinks(input),
  };
}
