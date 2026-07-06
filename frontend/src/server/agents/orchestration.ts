import type { AgentInputIdentity, AgentResult, PortfolioSnapshot } from "@/server/types";
import { runDecisionAgent } from "@/server/agents/decision";
import { runNewsAgent } from "@/server/agents/news";
import { runOnchainAgent } from "@/server/agents/onchain";
import { runPortfolioAgent } from "@/server/agents/portfolio";
import { runSocialAgent } from "@/server/agents/social";
import { runAgentSafely } from "@/server/agents/shared";
import { resolveTokenIdentity } from "@/server/identity/tokenIdentity";

export type AgentRunMode = "portfolio_review" | "token_scan" | "pre_buy_check" | "holding_review" | "execution_prepare";

type AgentOrchestrationInput = {
  mode: AgentRunMode;
  walletAddress?: string;
  identity?: AgentInputIdentity;
  portfolio?: PortfolioSnapshot;
};

type AgentOrchestrationResult = {
  mode: AgentRunMode;
  identity?: ReturnType<typeof resolveTokenIdentity>;
  results: AgentResult[];
  decision: AgentResult;
};

function getRiskiestHolding(portfolio?: PortfolioSnapshot): AgentInputIdentity | undefined {
  const holding = [...(portfolio?.holdings ?? [])].sort((left, right) => {
    const riskGap = right.riskScore - left.riskScore;

    return riskGap !== 0 ? riskGap : right.allocationPercent - left.allocationPercent;
  })[0];

  if (!holding) {
    return undefined;
  }

  return {
    chain: holding.chainId ?? holding.chainName,
    contractAddress: holding.tokenAddress,
    symbol: holding.symbol,
    tokenName: holding.name,
  };
}

async function runTokenSpecialists(identity: ReturnType<typeof resolveTokenIdentity>) {
  const [onchain, news, social] = await Promise.all([
    runAgentSafely("onchain", () =>
      runOnchainAgent({
        chain: identity.chain,
        contractAddress: identity.contractAddress,
      }),
    ),
    runAgentSafely("news", () =>
      runNewsAgent({
        tokenName: identity.tokenName,
        symbol: identity.symbol,
        contractAddress: identity.contractAddress,
        websiteUrl: identity.websiteUrl,
        chain: identity.chain,
      }),
    ),
    runAgentSafely("social", () =>
      runSocialAgent({
        tokenName: identity.tokenName,
        symbol: identity.symbol,
        contractAddress: identity.contractAddress,
        websiteUrl: identity.websiteUrl,
        twitterUrl: identity.twitterUrl,
        telegramUrl: identity.telegramUrl,
      }),
    ),
  ]);

  return [onchain, news, social];
}

export async function runAgentOrchestration(input: AgentOrchestrationInput): Promise<AgentOrchestrationResult> {
  const results: AgentResult[] = [];
  let identityInput = input.identity;

  if (input.mode === "portfolio_review" || input.mode === "holding_review" || input.mode === "execution_prepare") {
    const portfolioResult = await runAgentSafely("portfolio", () => runPortfolioAgent(input.walletAddress));
    results.push(portfolioResult);
    identityInput = identityInput ?? getRiskiestHolding(input.portfolio);
  }

  const identity = identityInput ? resolveTokenIdentity(identityInput) : undefined;

  if (identity && input.mode !== "execution_prepare") {
    results.push(...(await runTokenSpecialists(identity)));
  }

  const decision = runDecisionAgent({ results });

  return {
    mode: input.mode,
    identity,
    results,
    decision,
  };
}
