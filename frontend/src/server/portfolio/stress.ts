import type { PortfolioSnapshot, PortfolioStressResult, PortfolioStressDelta, TokenHolding } from "../types";
import type { PortfolioStressScenario } from "./scenarios";
import { getKnownTokenClass } from "./tokenRegistry";

function matchesTarget(holding: TokenHolding, target: string): boolean {
  if (target === "all") return true;
  if (target === "non_stablecoins") return getKnownTokenClass(holding.symbol) !== "stablecoin";
  if (target === "stablecoins") return getKnownTokenClass(holding.symbol) === "stablecoin";
  if (target === "memecoins") return getKnownTokenClass(holding.symbol) === "meme";
  if (target === "stellar_native") {
    const chain = holding.chainId ?? holding.chainName ?? "";
    return holding.assetKind === "native" && (chain.toLowerCase().startsWith("stellar") || (!chain && holding.tokenAddress === "stellar:native"));
  }
  return holding.symbol === target || holding.tokenAddress === target;
}

export function applyStressScenario(
  snapshot: PortfolioSnapshot,
  scenario: PortfolioStressScenario
): PortfolioStressResult {
  const assumptions: string[] = [];
  const affectedHoldings = new Set<string>();

  let originalValueUsd = 0;
  let stressedValueUsd = 0;

  const stressedHoldings = snapshot.holdings.map((holding) => {
    originalValueUsd += holding.valueUsd;
    
    let newPriceUsd = holding.priceUsd;
    if (newPriceUsd === null) {
      stressedValueUsd += holding.valueUsd;
      return { ...holding };
    }

    let changed = false;

    for (const change of scenario.changes) {
      if (matchesTarget(holding, change.target)) {
        
        if (change.type === "price_multiplier" && change.multiplier !== undefined) {
          newPriceUsd = newPriceUsd * change.multiplier;
          assumptions.push(`Applied ${change.multiplier}x multiplier to ${holding.symbol} (Target: ${change.target})`);
          changed = true;
        } else if (change.type === "fixed_price" && change.fixedUsd !== undefined) {
          newPriceUsd = change.fixedUsd;
          assumptions.push(`Fixed price of ${holding.symbol} to $${change.fixedUsd} (Target: ${change.target})`);
          changed = true;
        } else if (change.type === "depeg" && change.fixedUsd !== undefined) {
          newPriceUsd = change.fixedUsd;
          assumptions.push(`Depegged ${holding.symbol} to $${change.fixedUsd} (Target: ${change.target})`);
          changed = true;
        }
      }
    }

    if (changed && newPriceUsd !== holding.priceUsd) {
      affectedHoldings.add(holding.symbol);
    }
    
    const newValueUsd = newPriceUsd * holding.balance;
    stressedValueUsd += newValueUsd;
    
    return {
      ...holding,
      priceUsd: newPriceUsd,
      valueUsd: newValueUsd,
    };
  });
  
  for (const holding of stressedHoldings) {
    holding.allocationPercent = stressedValueUsd > 0 ? holding.valueUsd / stressedValueUsd * 100 : 0;
  }

  const valueDeltaUsd = stressedValueUsd - originalValueUsd;
  const percentageDelta = originalValueUsd !== 0 ? (valueDeltaUsd / originalValueUsd) * 100 : 0;
  
  const originalRiskScore = snapshot.riskScore;
  const stressedRiskScore = snapshot.riskScore; // Stays same for now
  
  const delta: PortfolioStressDelta = {
    originalValueUsd,
    stressedValueUsd,
    valueDeltaUsd,
    percentageDelta,
    originalRiskScore,
    stressedRiskScore,
    riskScoreDelta: stressedRiskScore - originalRiskScore,
  };
  
  const stressedSnapshot: PortfolioSnapshot = {
    ...snapshot,
    totalValueUsd: snapshot.totalValueUsd + valueDeltaUsd,
    holdings: stressedHoldings,
  };
  
  const uniqueAssumptions = Array.from(new Set(assumptions));

  return {
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    baseSnapshot: snapshot,
    stressedSnapshot,
    delta,
    assumptions: uniqueAssumptions,
    affectedHoldings: Array.from(affectedHoldings),
  };
}
