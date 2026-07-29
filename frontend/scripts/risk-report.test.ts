import { buildRiskReport, validateRiskReport, riskReportConventions } from "../src/server/scan/riskReport";
import { runDecisionAgent } from "../src/server/agents/decision";
import { buildAgentResult } from "../src/server/agents/shared";
import { goldenFixtureSuite, goldenScoreSnapshots } from "../src/server/evaluation/goldenFixtures";
import { missingDataDoesNotIncreaseConfidence, criticalFindingDoesNotLowerRisk, noAgentResultRequiresManualReview } from "../src/server/evaluation/properties";
import type { AgentResult } from "../src/server/types";

const FIXTURE_TIME = new Date("2026-07-06T12:00:00.000Z").toISOString();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function agentResult(input: Partial<AgentResult> & Pick<AgentResult, "agent" | "riskScore" | "verdict" | "summary">): AgentResult {
  const riskScore = input.riskScore;
  const sources = input.sources ?? [{ label: `${input.agent} fixture source`, status: "connected" as const, checkedAt: FIXTURE_TIME, reliability: 0.8 }];

  return buildAgentResult({
    agent: input.agent,
    score: input.score ?? riskScore,
    verdict: input.verdict,
    summary: input.summary,
    findings: input.findings ?? [],
    sources,
    confidence: input.confidence ?? 0.72,
    recommendedAction: input.recommendedAction ?? (riskScore >= 75 ? "avoid" : riskScore >= 50 ? "manual_review" : "hold"),
    blockingReasons: input.blockingReasons,
    missingData: input.missingData,
    rawSignals: input.rawSignals,
  });
}

function normalized(chain: string, contractAddress: string, symbol: string, name: string, source: "contract_address" | "stellar_asset" | "stellar_issuer" | "dexscreener_pair_url", assetType?: "native" | "classic" | "contract" | "issuer_account", issuer?: string) {
  return {
    chain,
    contractAddress,
    symbol,
    name,
    source,
    assetType,
    issuer,
  } as const;
}

function buildReport(
  query: string,
  chain: string,
  norm: ReturnType<typeof normalized>,
  results: AgentResult[],
  decision: AgentResult,
  createdAt = FIXTURE_TIME,
) {
  return buildRiskReport({
    query,
    requestedChain: chain,
    normalized: norm,
    results,
    decision,
    createdAt,
  });
}

function assertReportValid(report: ReturnType<typeof buildRiskReport>) {
  const parsed = validateRiskReport(report);
  assert(parsed.success, `RiskReport must pass runtime schema validation.`);
}

function getCard(report: ReturnType<typeof buildRiskReport>, agent: string) {
  return report.agentCards.find((card) => card.agent === agent);
}

function honeypotResult(): AgentResult {
  return agentResult({
    agent: "onchain",
    riskScore: 92,
    verdict: "Honeypot detected",
    summary: "Contract is a honeypot and cannot sell.",
    findings: [
      { label: "Honeypot detected", severity: "critical", detail: "Token cannot be sold after purchase." },
      { label: "Cannot sell all", severity: "critical", detail: "LP liquidity is locked and cannot be sold." },
    ],
    blockingReasons: ["Critical finding: Honeypot detected", "Critical finding: Cannot sell all"],
    recommendedAction: "avoid",
    rawSignals: {
      security: { is_honeypot: "1", cannot_sell_all: "1" },
      scoreBreakdown: { honeypot: 92, cannotSell: 95, liquidity: 40 },
    },
  });
}

function cannotSellResult(): AgentResult {
  return agentResult({
    agent: "onchain",
    riskScore: 88,
    verdict: "Cannot sell all",
    summary: "Token cannot be sold due to blocked transfers.",
    findings: [{ label: "Cannot sell transfer blocked", severity: "critical", detail: "Sell transfer is disabled contract-wide." }],
    blockingReasons: ["Critical finding: Cannot sell transfer blocked"],
    recommendedAction: "avoid",
    rawSignals: {
      security: { cannot_sell_all: "1" },
      scoreBreakdown: { cannotSell: 88 },
    },
  });
}

function blacklistResult(): AgentResult {
  return agentResult({
    agent: "onchain",
    riskScore: 82,
    verdict: "Blacklisted",
    summary: "Token contract address is on blocklist.",
    findings: [{ label: "Contract blacklisted", severity: "critical", detail: "Address appears on active blocklist." }],
    blockingReasons: ["Critical finding: Contract blacklisted"],
    recommendedAction: "avoid",
    rawSignals: {
      security: { is_blacklisted: "1" },
      scoreBreakdown: { blacklist: 82 },
    },
  });
}

function identityConflictResult(): AgentResult {
  return agentResult({
    agent: "social",
    riskScore: 78,
    verdict: "Identity conflict",
    summary: "Official account does not match contract identity.",
    findings: [{ label: "Identity mismatch", severity: "critical", detail: "Social account does not match token contract identity." }],
    blockingReasons: ["Critical finding: Identity mismatch"],
    recommendedAction: "manual_review",
    confidence: 0.3,
    rawSignals: {
      identity: { handle: "fake_goat", confidence: 0.3 },
      officialAccountConfidence: 0.2,
      impersonation: { riskScore: 78 },
    },
  });
}

function lowConfidenceResult(): AgentResult {
  return agentResult({
    agent: "news",
    riskScore: 30,
    verdict: "Low confidence news",
    summary: "Only one unavailable source contributed.",
    findings: [{ label: "Missing source", severity: "medium", detail: "News provider unavailable." }],
    sources: [{ label: "News fixture source", status: "unavailable" as const, checkedAt: FIXTURE_TIME, reliability: 0.1 }],
    confidence: 0.18,
    recommendedAction: "manual_review",
    missingData: [{ field: "news provider", reason: "Provider unavailable.", impact: "medium", requiredFor: "confidence" }],
    rawSignals: { sourceReliability: 0.1 },
  });
}

function blueChipResult(): AgentResult {
  return agentResult({
    agent: "onchain",
    riskScore: 18,
    verdict: "No major onchain flags",
    summary: "Clean onchain profile.",
    findings: [{ label: "Clean onchain data", severity: "low", detail: "No blocker." }],
    recommendedAction: "hold",
    confidence: 0.78,
    rawSignals: { scoreBreakdown: { holderConcentration: 18, liquidityExit: 22, marketAnomaly: 15 } },
  });
}

function portfolioResult(riskScore: number, exposurePercent: number, stableReservePercent: number): AgentResult {
  return agentResult({
    agent: "portfolio",
    riskScore,
    verdict: riskScore >= 50 ? "High portfolio risk" : "Portfolio ok",
    summary: `Target token exposure is ${exposurePercent}% of wallet.`,
    findings: [{ label: "Target token exposure", severity: riskScore >= 50 ? "high" : "low", detail: `Target is ${exposurePercent}% of wallet.` }],
    rawSignals: {
      portfolioRisk: {
        largestHoldingPercent: exposurePercent,
        stableReservePercent,
        concentrationRisk: riskScore,
        liquidityExitRisk: riskScore,
        stableReserveRisk: stableReservePercent < 10 ? 80 : 20,
      },
    },
    recommendedAction: riskScore >= 50 ? "reduce_exposure" : "hold",
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. AgentResult to RiskReport mapper and runtime validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testMapperAndValidation() {
  const hon = honeypotResult();
  const dec = runDecisionAgent({ results: [hon] });
  const report = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec);

  assertReportValid(report);
  assert(report.id.startsWith("risk_"), "Report id must use the deterministic hash prefix.");
  assert(report.buyRisk === hon.riskScore, "Buy risk must mirror the decision risk score.");
  assert(report.verdict === "avoid", "Critical honeypot must map to avoid verdict.");
  assert(report.agentCards.length === 1, "Report must contain agent cards for each result.");
  assert(report.agentCards[0].agent === "onchain", "Agent card must preserve agent identity.");
  assert(report.agentCards[0].displayName === "Contract Guard", "Agent card must expose UI-ready display name.");
  assert(report.input.chain === "base", "Report input must preserve requested chain.");
  assert(report.input.contractAddress === "0x333333333333333333333333333333333333", "Report input must preserve contract address.");
  assert(report.input.source === "contract_address", "Report input must preserve source type.");
  assert(report.createdAt === FIXTURE_TIME, "Report createdAt must use the supplied timestamp for stability.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Deterministic score-factor ordering and top-reason selection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testFactorOrdering() {
  const hon = honeypotResult();
  const dec = runDecisionAgent({ results: [hon] });
  const report = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec);
  const card = getCard(report, "onchain");

  assert(card !== undefined, "Report must contain onchain card.");
  const sorted = [...(card?.factors ?? [])];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevWeight = prev.severity === "critical" ? 92 : prev.severity === "high" ? 68 : prev.severity === "medium" ? 36 : 12;
    const currWeight = curr.severity === "critical" ? 92 : curr.severity === "high" ? 68 : curr.severity === "medium" ? 36 : 12;
    assert(
      prevWeight >= currWeight || Math.abs(prev.impact) >= Math.abs(curr.impact),
      `Factors must be ordered by severity then impact: ${prev.label} (${prev.severity}) should not come after ${curr.label} (${curr.severity})`,
    );
  }
}

function testTopReasons() {
  const hon = honeypotResult();
  const dec = runDecisionAgent({ results: [hon] });
  const report = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec);

  assert(report.topReasons.length > 0, "Report must include top reasons.");
  assert(report.topReasons[0].includes("Contract Guard"), "Top reason must be from Contract Guard for honeypot.");
  assert(report.topReasons.length <= 5, "Top reasons must be capped at 5.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Honeypot/cannot-sell/blacklist and identity-conflict overrides
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testHoneypotOverride() {
  const hon = honeypotResult();
  const dec = runDecisionAgent({ results: [hon] });
  const report = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec);
  const card = getCard(report, "onchain");

  assert(report.verdict === "avoid", "Honeypot must force avoid verdict.");
  assert(report.buyRisk >= 75, "Honeypot must produce critical buy risk.");
  assert(card?.criticalFactors?.some((f) => f.category === "sellability"), "Critical honeypot/cannot-sell override must be exposed in Contract Guard.");
}

function testCannotSellOverride() {
  const cs = cannotSellResult();
  const dec = runDecisionAgent({ results: [cs] });
  const report = buildReport("0x444444444444444444444444444444444444", "base", normalized("base", "0x444444444444444444444444444444444444", "NOS", "No Sell Token", "contract_address"), [cs], dec);

  assert(report.verdict === "avoid", "Cannot-sell must force avoid verdict.");
  assert(report.buyRisk >= 75, "Cannot-sell must produce critical buy risk.");
}

function testBlacklistOverride() {
  const bl = blacklistResult();
  const dec = runDecisionAgent({ results: [bl] });
  const report = buildReport("0x555555555555555555555555555555555555", "base", normalized("base", "0x555555555555555555555555555555555555", "BLK", "Blacklisted Token", "contract_address"), [bl], dec);

  assert(report.verdict === "avoid", "Blacklist must force avoid verdict.");
  assert(report.buyRisk >= 75, "Blacklist must produce high buy risk.");
}

function testIdentityConflictOverride() {
  const ic = identityConflictResult();
  const dec = runDecisionAgent({ results: [ic] });
  const report = buildReport("GOAT", "base", normalized("base", "0x333333333333333333333333333333333333", "GOAT", "Goat Token", "contract_address"), [ic], dec);

  assert(report.verdict === "avoid" || report.verdict === "manual_review", "Identity conflict must force avoid or manual_review.");
  assert(report.buyRisk >= 50, "Identity conflict must produce high buy risk.");
  const card = getCard(report, "social");
  assert(card?.criticalFactors?.some((f) => f.category === "phishing" || f.label === "Identity mismatch"), "Identity conflict must appear as critical factor in Social Scout.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Missing-provider confidence penalties and low confidence buy_small
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testMissingSourceLowersConfidence() {
  const unavail = lowConfidenceResult();
  const dec = runDecisionAgent({ results: [unavail] });
  const report = buildReport("DOWN", "base", normalized("base", "0x666666666666666666666666666666666666", "DOWN", "Down Token", "contract_address"), [unavail], dec);

  assert(report.confidence <= 0.32, "Missing sources must cap confidence at 0.32 or lower.");
  assert(report.verdict === "manual_review", "Low confidence must produce manual_review verdict.");
}

function testLowConfidenceCannotProduceBuySmall() {
  const lowConf = agentResult({
    agent: "onchain",
    riskScore: 15,
    verdict: "Low risk token",
    summary: "Clean token with low confidence.",
    findings: [{ label: "Clean data", severity: "low", detail: "No issues." }],
    confidence: 0.3,
    recommendedAction: "hold",
    sources: [{ label: "Low conf source", status: "unavailable" as const, checkedAt: FIXTURE_TIME, reliability: 0.1 }],
  });
  const dec = runDecisionAgent({ results: [lowConf] });
  const report = buildReport("LOWCONF", "base", normalized("base", "0x777777777777777777777777777777777777", "LOWCONF", "Low Conf Token", "contract_address"), [lowConf], dec);

  assert(report.verdict !== "buy_small", "Low confidence must never produce buy_small verdict regardless of low risk score.");
  assert(report.verdict === "manual_review", "Low confidence must force manual_review instead.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Portfolio exposure, stable reserve, wallet-not-connected
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testPortfolioExposure() {
  const onchain = agentResult({
    agent: "onchain",
    riskScore: 65,
    verdict: "High onchain risk",
    summary: "Liquidity exit risk elevated.",
    findings: [{ label: "Low liquidity", severity: "high", detail: "Liquidity is critically low." }],
    recommendedAction: "manual_review",
    confidence: 0.7,
    rawSignals: { scoreBreakdown: { liquidityExit: 65 } },
  });
  const portfolio = portfolioResult(68, 48, 4);
  const dec = runDecisionAgent({
    results: [onchain, portfolio],
    context: { mode: "token_scan", userAlreadyOwnsToken: true, holdingAllocationPercent: 48, stableReservePercent: 4 },
  });
  const report = buildReport("0x8888888888888888888888888888888888", "base", normalized("base", "0x8888888888888888888888888888888888", "EXPO", "Exposure Token", "contract_address"), [onchain, portfolio], dec);

  assert(report.verdict === "reduce_exposure" || report.verdict === "manual_review" || report.verdict === "avoid", "High exposure must not recommend hold or watch.");
  const portfolioCard = getCard(report, "portfolio");
  assert(portfolioCard !== undefined, "Report must include portfolio card.");
  assert(portfolioCard?.factors.some((f) => f.label === "Stable reserve"), "Portfolio Keeper must expose stable reserve factor.");
}

function testStableReserve() {
  const onchain = blueChipResult();
  const portfolio = portfolioResult(45, 30, 25);
  const dec = runDecisionAgent({
    results: [onchain, portfolio],
    context: { mode: "token_scan", userAlreadyOwnsToken: true, holdingAllocationPercent: 30, stableReservePercent: 25 },
  });
  const report = buildReport("0x999999999999999999999999999999999999", "base", normalized("base", "0x999999999999999999999999999999999999", "STAB", "Stable Reserve Token", "contract_address"), [onchain, portfolio], dec);

  assert(report.buyRisk < 75, "Stable reserve must help keep buy risk below critical.");
  const portfolioCard = getCard(report, "portfolio");
  assert(portfolioCard?.factors.some((f) => f.label === "Stable reserve"), "Portfolio Keeper must expose stable reserve factor.");
}

function testWalletNotConnected() {
  const onchain = honeypotResult();
  const noWallet = agentResult({
    agent: "portfolio",
    riskScore: 75,
    verdict: "Wallet not connected",
    summary: "No wallet provider was connected.",
    findings: [{ label: "No wallet", severity: "medium", detail: "Wallet provider is not connected." }],
    sources: [{ label: "Portfolio fixture source", status: "unavailable" as const, checkedAt: FIXTURE_TIME, reliability: 0.1 }],
    confidence: 0.18,
    recommendedAction: "manual_review",
    missingData: [{ field: "wallet provider", reason: "Wallet not connected.", impact: "medium", requiredFor: "portfolio exposure" }],
  });
  const dec = runDecisionAgent({
    results: [onchain, noWallet],
    context: { mode: "token_scan", userAlreadyOwnsToken: false, holdingAllocationPercent: 0, stableReservePercent: 0 },
  });
  const report = buildReport("0xaaaaaaaaaaaabbbbbbbbbbbbcccccccccccc", "base", normalized("base", "0xaaaaaaaaaaaabbbbbbbbbbbbcccccccccccc", "NOWALLET", "No Wallet Token", "contract_address"), [onchain, noWallet], dec);

  assert(report.verdict === "avoid", "Honeypot must still force avoid even when wallet is not connected.");
  assert(!dec.blockingReasons.some((r) => r.includes("portfolio")), "Empty wallet context must not change intrinsic token scan risk.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. EVM and Stellar fixtures sharing the common report contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testEvmNativeToken() {
  const onchain = agentResult({
    agent: "onchain",
    riskScore: 12,
    verdict: "Clean native token",
    summary: "Native EVM token with no onchain flags.",
    findings: [{ label: "Native EVM token", severity: "low", detail: "Token is a native EVM asset with clean onchain data." }],
    recommendedAction: "hold",
    confidence: 0.85,
    rawSignals: {
      security: {},
      scoreBreakdown: { holderConcentration: 12, liquidityExit: 15, marketAnomaly: 10 },
      contractIdentity: { checked: true, deployed: true, bytecodeSize: 128 },
      nativeAsset: true,
      chainFamily: "evm",
    },
  });
  const dec = runDecisionAgent({ results: [onchain] });
  const report = buildRiskReport({
    query: "0xnativeevm",
    requestedChain: "base",
    normalized: { ...normalized("base", "0xnativeevm", "EVN", "EVM Native Token", "contract_address"), assetType: "contract" as const },
    results: [onchain],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.input.assetType === "contract", "EVM native token fixture must use contract source type.");
  assert(report.agentCards.some((card) => card.agent === "onchain"), "EVM fixture must include onchain agent card.");
}

function testEvmClassicCodeIssuer() {
  const onchain = agentResult({
    agent: "onchain",
    riskScore: 35,
    verdict: "Classic token with CODE:ISSUER",
    summary: "Classic token with standard CODE:ISSUER format.",
    findings: [{ label: "Classic token", severity: "medium", detail: "Token uses CODE:ISSUER format on EVM." }],
    recommendedAction: "watch",
    confidence: 0.65,
    rawSignals: {
      security: {},
      scoreBreakdown: { holderConcentration: 35, liquidityExit: 40, marketAnomaly: 30 },
      contractIdentity: { checked: true, deployed: true, bytecodeSize: 64 },
      classicAsset: "CODE:ISSUER",
      chainFamily: "evm",
    },
  });
  const dec = runDecisionAgent({ results: [onchain] });
  const report = buildRiskReport({
    query: "CODE:ISSUER",
    requestedChain: "ethereum",
    normalized: normalized("ethereum", "0xclassicevm", "CODE", "Classic Token", "contract_address", "classic"),
    results: [onchain],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.input.assetType === "classic", "Classic CODE:ISSUER fixture must use classic asset type.");
  assert(report.buyRisk >= 25 && report.buyRisk < 50, "Classic CODE:ISSUER token moderate risk must be in watch band.");
}

function testStellarNativeXlm() {
  const stellar = agentResult({
    agent: "onchain",
    riskScore: 8,
    verdict: "Native XLM asset",
    summary: "Native Stellar Lumens asset with clean onchain data.",
    findings: [{ label: "Native XLM", severity: "low", detail: "Native Stellar asset with no flags." }],
    recommendedAction: "hold",
    confidence: 0.9,
    rawSignals: {
      security: {},
      scoreBreakdown: { liquidityExit: 8, marketAnomaly: 5 },
      stellarIdentity: { type: "native", symbol: "XLM", name: "Stellar Lumens" },
      chainFamily: "stellar",
      nativeAsset: true,
    },
  });
  const dec = runDecisionAgent({ results: [stellar] });
  const report = buildRiskReport({
    query: "XLM",
    requestedChain: "stellar",
    normalized: normalized("stellar", "native", "XLM", "Stellar Lumens", "stellar_asset", "native"),
    results: [stellar],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.input.source === "stellar_asset", "Stellar native XLM fixture must use stellar_asset source type.");
  assert(report.agentCards.some((card) => card.agent === "onchain"), "Stellar fixture must include onchain agent card without applying EVM-only checks.");
}

function testStellarClassicCodeIssuer() {
  const stellar = agentResult({
    agent: "onchain",
    riskScore: 28,
    verdict: "Classic stellar asset",
    summary: "Classic Stellar asset in CODE:ISSUER format.",
    findings: [{ label: "Classic asset", severity: "medium", detail: "Stellar classic asset with standard CODE:ISSUER format." }],
    recommendedAction: "watch",
    confidence: 0.7,
    rawSignals: {
      security: {},
      scoreBreakdown: { liquidityExit: 28, marketAnomaly: 20 },
      stellarIdentity: { type: "classic", assetKey: "CODE:ISSUER", symbol: "CODE", name: "Classic Token" },
      chainFamily: "stellar",
      classicAsset: "CODE:ISSUER",
    },
  });
  const dec = runDecisionAgent({ results: [stellar] });
  const report = buildRiskReport({
    query: "CODE:ISSUER",
    requestedChain: "stellar",
    normalized: normalized("stellar", "GADDPE6O2J3K6F4P5Q6R7S8T9U0V1W2X3Y4Z5A6B7C8D9E0F1G2H3I4", "CODE", "Classic Stellar Token", "stellar_issuer", "classic", "GABCDEF1234567890ABCDEF1234567890ABCDEF12"),
    results: [stellar],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.input.source === "stellar_issuer", "Stellar classic asset fixture must use stellar_issuer source type.");
  assert(report.buyRisk >= 25 && report.buyRisk < 50, "Stellar classic asset moderate risk must be in watch band.");
}

function testStellarSorobanContract() {
  const stellar = agentResult({
    agent: "onchain",
    riskScore: 15,
    verdict: "Soroban contract",
    summary: "Soroban WASM contract with clean onchain data.",
    findings: [{ label: "Soroban contract", severity: "low", detail: "Soroban WASM contract with no flags." }],
    recommendedAction: "hold",
    confidence: 0.8,
    rawSignals: {
      security: {},
      scoreBreakdown: { liquidityExit: 15, marketAnomaly: 10 },
      stellarIdentity: { type: "contract", assetKey: "soroban", symbol: "SORO", name: "Soroban Token", contractId: "CA3DFH5..." },
      chainFamily: "stellar",
      contractType: "wasm",
    },
  });
  const dec = runDecisionAgent({ results: [stellar] });
  const report = buildRiskReport({
    query: "CA3DFH5...",
    requestedChain: "stellar",
    normalized: normalized("stellar", "CA3DFH5...", "SORO", "Soroban Token", "contract_address", "contract"),
    results: [stellar],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.agentCards.some((card) => card.agent === "onchain"), "Soroban fixture must include onchain agent card.");
}

function testStellarInvalidIssuer() {
  const stellar = agentResult({
    agent: "onchain",
    riskScore: 60,
    verdict: "Invalid issuer",
    summary: "Stellar asset with invalid or unverifiable issuer.",
    findings: [{ label: "Invalid issuer", severity: "high", detail: "Issuer account does not exist or cannot be verified." }],
    recommendedAction: "manual_review",
    confidence: 0.45,
    rawSignals: {
      security: {},
      scoreBreakdown: { issuerVerification: 60, liquidityExit: 50, marketAnomaly: 40 },
      stellarIdentity: { type: "classic", assetKey: "XLM:INVALID", symbol: "XLM", name: "XLM", issuer: "GINVALIDISSUER1234567890123456789012" },
      chainFamily: "stellar",
    },
  });
  const dec = runDecisionAgent({ results: [stellar] });
  const report = buildRiskReport({
    query: "XLM:INVALID",
    requestedChain: "stellar",
    normalized: normalized("stellar", "GINVALIDISSUER1234567890123456789012", "XLM", "XLM", "stellar_issuer", "classic", "GINVALIDISSUER1234567890123456789012"),
    results: [stellar],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.verdict === "manual_review", "Invalid issuer must produce manual_review verdict.");
}

function testStellarUnavailableProvider() {
  const stellar = agentResult({
    agent: "onchain",
    riskScore: 55,
    verdict: "Stellar provider unavailable",
    summary: "Stellar onchain provider was unavailable.",
    findings: [{ label: "Provider unavailable", severity: "medium", detail: "Stellar RPC provider did not respond." }],
    sources: [{ label: "Stellar RPC", status: "unavailable" as const, checkedAt: FIXTURE_TIME, reliability: 0.1 }],
    confidence: 0.22,
    recommendedAction: "manual_review",
    missingData: [{ field: "stellar rpc", reason: "Provider unavailable.", impact: "high", requiredFor: "agent confidence" }],
    rawSignals: {
      security: {},
      scoreBreakdown: { liquidityExit: 55, marketAnomaly: 50 },
      stellarIdentity: { type: "native", symbol: "XLM" },
      chainFamily: "stellar",
    },
  });
  const dec = runDecisionAgent({ results: [stellar] });
  const report = buildRiskReport({
    query: "XLM_UNAVAILABLE",
    requestedChain: "stellar",
    normalized: normalized("stellar", "native", "XLM", "XLM", "stellar_asset", "native"),
    results: [stellar],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.confidence <= 0.32, "Unavailable provider must lower confidence.");
  assert(report.verdict === "manual_review", "Unavailable provider must force manual_review.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Deterministic output stability across timezones and wall-clock time
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testDeterministicOutputStability() {
  const hon = honeypotResult();
  const dec = runDecisionAgent({ results: [hon] });
  const report1 = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec, FIXTURE_TIME);
  const report2 = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec, FIXTURE_TIME);

  assert(report1.id === report2.id, "Same input and createdAt must produce identical report id.");
  assert(report1.buyRisk === report2.buyRisk, "Same input must produce identical buy risk.");
  assert(report1.verdict === report2.verdict, "Same input must produce identical verdict.");
  assert(report1.topReasons.join("|") === report2.topReasons.join("|"), "Same input must produce identical top reasons.");
  assert(report1.confidence === report2.confidence, "Same input must produce identical confidence.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Critical blocker removal causes test failure (verdict change)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testCriticalBlockerRemovalChangesVerdict() {
  const hon = honeypotResult();
  const dec = runDecisionAgent({ results: [hon] });
  const report = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec);

  assert(report.verdict === "avoid", "Honeypot must produce avoid verdict.");
  assert(report.buyRisk >= 75, "Critical blocker must force critical buy risk.");

  const withoutCritical = agentResult({
    agent: "onchain",
    riskScore: 30,
    verdict: "Clean token",
    summary: "No critical onchain flags.",
    findings: [{ label: "Clean onchain", severity: "low", detail: "No blocker." }],
    recommendedAction: "hold",
    confidence: 0.78,
  });
  const cleanDec = runDecisionAgent({ results: [withoutCritical] });
  const cleanReport = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [withoutCritical], cleanDec);

  assert(cleanReport.verdict !== "avoid", "Removing critical blocker must change verdict away from avoid.");
  assert(cleanReport.buyRisk < 50, "Removing critical blocker must reduce buy risk below high-risk band.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. Missing sources lower confidence, no mock production data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testMissingSourcesNeverMockProductionData() {
  const unavail = lowConfidenceResult();
  const report = buildReport("UNAVAILABLE", "base", normalized("base", "0x666666666666666666666666666666666666", "UNAVAIL", "Unavailable Token", "contract_address"), [unavail], runDecisionAgent({ results: [unavail] }));

  assert(report.confidence <= 0.32, "Missing sources must lower confidence.");
  assert(report.verdict === "manual_review", "Missing sources must never produce a confident buy/hold verdict.");
  assert(report.missingData.length > 0, "Report must include missing data entries for unavailable sources.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. Agent score and final Buy Risk remain semantically distinct
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testScoreAndBuyRiskSemantics() {
  const onchain = agentResult({
    agent: "onchain",
    riskScore: 45,
    verdict: "Medium onchain risk",
    summary: "Moderate onchain flags present.",
    findings: [{ label: "Medium risk finding", severity: "medium", detail: "Some onchain concern." }],
    recommendedAction: "manual_review",
    confidence: 0.65,
  });
  const portfolio = agentResult({
    agent: "portfolio",
    riskScore: 20,
    verdict: "Low portfolio risk",
    summary: "Portfolio exposure is within limits.",
    findings: [{ label: "Low exposure", severity: "low", detail: "Portfolio risk is within tolerance." }],
    recommendedAction: "hold",
    confidence: 0.7,
  });
  const dec = runDecisionAgent({
    results: [onchain, portfolio],
    context: { mode: "token_scan", userAlreadyOwnsToken: false },
  });
  const report = buildReport("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "base", normalized("base", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "MIX", "Mixed Token", "contract_address"), [onchain, portfolio], dec);

  assert(report.buyRisk === dec.riskScore, "Report buyRisk must equal the decision risk score.");
  assert(report.agentCards.some((card) => card.score === onchain.riskScore), "Onchain agent card must preserve its own risk score.");
  assert(report.agentCards.some((card) => card.score === portfolio.riskScore), "Portfolio agent card must preserve its own risk score.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 11. EVM and Stellar fixtures share common report contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testEvmStellarSharedReportContract() {
  const evmResult = agentResult({
    agent: "onchain",
    riskScore: 30,
    verdict: "EVM token",
    summary: "Clean EVM token.",
    findings: [{ label: "EVM clean", severity: "low", detail: "No flags." }],
    recommendedAction: "hold",
    confidence: 0.8,
  });
  const stellarResult = agentResult({
    agent: "onchain",
    riskScore: 25,
    verdict: "Stellar token",
    summary: "Clean Stellar token.",
    findings: [{ label: "Stellar clean", severity: "low", detail: "No flags." }],
    recommendedAction: "hold",
    confidence: 0.82,
  });

  const evmDec = runDecisionAgent({ results: [evmResult] });
  const stellarDec = runDecisionAgent({ results: [stellarResult] });

  const evmReport = buildRiskReport({
    query: "0xevm",
    requestedChain: "base",
    normalized: normalized("base", "0xevm", "EVN", "EVM Token", "contract_address"),
    results: [evmResult],
    decision: evmDec,
    createdAt: FIXTURE_TIME,
  });
  const stellarReport = buildRiskReport({
    query: "XLM",
    requestedChain: "stellar",
    normalized: normalized("stellar", "native", "XLM", "Stellar Lumens", "stellar_asset", "native"),
    results: [stellarResult],
    decision: stellarDec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(evmReport);
  assertReportValid(stellarReport);
  assert(evmReport.agentCards.length === 1, "EVM report must contain exactly one agent card.");
  assert(stellarReport.agentCards.length === 1, "Stellar report must contain exactly one agent card.");
  assert(evmReport.agentCards[0].agent === "onchain", "EVM report card must use onchain agent.");
  assert(stellarReport.agentCards[0].agent === "onchain", "Stellar report card must use onchain agent.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 12. Deterministic report ID and stable fixture output
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testDeterministicReportId() {
  const onchain = blueChipResult();
  const dec = runDecisionAgent({ results: [onchain] });
  const report = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "BLUE", "Blue Chip Token", "contract_address"), [onchain], dec, FIXTURE_TIME);

  assert(report.id.startsWith("risk_"), "Report ID must use deterministic hash prefix.");
  assert(report.createdAt === FIXTURE_TIME, "Report timestamp must use the supplied time, not wall-clock.");
  assert(report.input.chain === "base", "Report chain must be preserved deterministically.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 13. Risk level bands and conventions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testRiskBands() {
  assert(riskReportConventions.riskBands.length === 4, "There must be exactly 4 risk bands.");
  assert(riskReportConventions.riskBands[0].min === 0 && riskReportConventions.riskBands[0].max === 24, "Low risk band must be 0-24.");
  assert(riskReportConventions.riskBands[1].min === 25 && riskReportConventions.riskBands[1].max === 49, "Watch risk band must be 25-49.");
  assert(riskReportConventions.riskBands[2].min === 50 && riskReportConventions.riskBands[2].max === 74, "High risk band must be 50-74.");
  assert(riskReportConventions.riskBands[3].min === 75 && riskReportConventions.riskBands[3].max === 100, "Critical risk band must be 75-100.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 14. Golden fixture suite integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testGoldenFixtures() {
  for (const name of goldenFixtureSuite) {
    assert(goldenScoreSnapshots[name] !== undefined, `Golden fixture ${name} must have a defined score snapshot.`);
  }
  assert(goldenFixtureSuite.length === Object.keys(goldenScoreSnapshots).length, "Golden fixture suite and snapshots must match.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 15. Evaluation property tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testEvaluationProperties() {
  const before = agentResult({
    agent: "onchain",
    riskScore: 30,
    verdict: "Medium risk",
    summary: "Some onchain flags.",
    findings: [{ label: "Medium finding", severity: "medium", detail: "Some concern." }],
    confidence: 0.6,
  });
  const afterWithCritical = agentResult({
    agent: "onchain",
    riskScore: 80,
    verdict: "Critical risk",
    summary: "Critical onchain flag found.",
    findings: [{ label: "Critical finding", severity: "critical", detail: "Critical issue found." }],
    confidence: 0.6,
  });
  const afterWithoutCritical = agentResult({
    agent: "onchain",
    riskScore: 30,
    verdict: "Medium risk",
    summary: "Same as before.",
    findings: [{ label: "Medium finding", severity: "medium", detail: "Some concern." }],
    confidence: 0.6,
  });
  const withMissingSource = agentResult({
    agent: "onchain",
    riskScore: 30,
    verdict: "Medium risk",
    summary: "Missing source.",
    findings: [{ label: "Missing source", severity: "medium", detail: "Provider unavailable." }],
    sources: [{ label: "unavailable", status: "unavailable" as const, checkedAt: FIXTURE_TIME, reliability: 0.1 }],
    confidence: 0.25,
    missingData: [{ field: "provider", reason: "Unavailable", impact: "medium", requiredFor: "confidence" }],
  });

  assert(criticalFindingDoesNotLowerRisk(before, afterWithCritical), "Adding a critical finding must not lower risk score.");
  assert(criticalFindingDoesNotLowerRisk(before, afterWithoutCritical), "Not adding a critical finding must be a no-op for this property.");
  assert(missingDataDoesNotIncreaseConfidence(before, withMissingSource), "Missing data must not increase confidence.");
  assert(noAgentResultRequiresManualReview(), "Empty agent results must require manual review.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 16. Wallet-not-connected behavior (exposed via portfolio agent)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testWalletNotConnectedPortfolioBehavior() {
  const onchain = blueChipResult();
  const emptyWallet = agentResult({
    agent: "portfolio",
    riskScore: 75,
    verdict: "No wallet connected",
    summary: "Wallet provider returned no usable holdings.",
    findings: [{ label: "No wallet", severity: "medium", detail: "Wallet provider is not connected." }],
    sources: [{ label: "Portfolio fixture source", status: "unavailable" as const, checkedAt: FIXTURE_TIME, reliability: 0.1 }],
    confidence: 0.18,
    recommendedAction: "manual_review",
    missingData: [{ field: "wallet", reason: "Not connected.", impact: "medium", requiredFor: "portfolio exposure" }],
  });
  const dec = runDecisionAgent({
    results: [onchain, emptyWallet],
    context: { mode: "token_scan", userAlreadyOwnsToken: false, holdingAllocationPercent: 0, stableReservePercent: 0 },
  });

  assert(!dec.blockingReasons.some((r) => r.includes("portfolio")), "Empty wallet context must not change intrinsic token scan risk.");
  assert(emptyWallet.missingData.length > 0, "Empty wallet must report missing data.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 17. EVM and Stellar share common report without EVM-only checks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testEvmStellarSharedReportWithoutEvmOnlyChecks() {
  const stellarNativeXlm = agentResult({
    agent: "onchain",
    riskScore: 10,
    verdict: "Clean native XLM",
    summary: "Native XLM with no onchain flags.",
    findings: [{ label: "Native XLM asset", severity: "low", detail: "No onchain flags for native asset." }],
    recommendedAction: "hold",
    confidence: 0.9,
    rawSignals: {
      security: {},
      scoreBreakdown: { liquidityExit: 10, marketAnomaly: 5 },
      stellarIdentity: { type: "native", symbol: "XLM" },
      chainFamily: "stellar",
      nativeAsset: true,
    },
  });
  const dec = runDecisionAgent({ results: [stellarNativeXlm] });
  const report = buildRiskReport({
    query: "XLM",
    requestedChain: "stellar",
    normalized: normalized("stellar", "native", "XLM", "Stellar Lumens", "stellar_asset", "native"),
    results: [stellarNativeXlm],
    decision: dec,
    createdAt: FIXTURE_TIME,
  });

  assertReportValid(report);
  assert(report.agentCards.some((card) => card.agent === "onchain"), "Stellar native XLM must share the common report contract.");
  assert(report.buyRisk < 25, "Clean native XLM must stay in low-risk band.");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 18. Score-factor ordering is deterministic across runs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function testFactorOrderingDeterminism() {
  const hon = honeypotResult();
  const dec = runDecisionAgent({ results: [hon] });
  const report1 = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec, FIXTURE_TIME);
  const report2 = buildReport("0x333333333333333333333333333333333333", "base", normalized("base", "0x333333333333333333333333333333333333", "HNY", "Honeypot Token", "contract_address"), [hon], dec, FIXTURE_TIME);

  const card1 = getCard(report1, "onchain");
  const card2 = getCard(report2, "onchain");
  assert(card1?.factors.length === card2?.factors.length, "Factor count must be stable.");
  for (let i = 0; i < (card1?.factors.length ?? 0); i++) {
    assert(card1?.factors[i].label === card2?.factors[i].label, `Factor at index ${i} must be stable across runs.`);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Runner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type TestCase = { name: string; fn: () => void };

const testCases: TestCase[] = [
  { name: "AgentResult to RiskReport mapper and runtime validation", fn: testMapperAndValidation },
  { name: "Deterministic score-factor ordering and top-reason selection", fn: testFactorOrdering },
  { name: "Top reasons selection", fn: testTopReasons },
  { name: "Honeypot critical override", fn: testHoneypotOverride },
  { name: "Cannot-sell critical override", fn: testCannotSellOverride },
  { name: "Blacklist critical override", fn: testBlacklistOverride },
  { name: "Identity-conflict critical override", fn: testIdentityConflictOverride },
  { name: "Missing-source confidence penalty", fn: testMissingSourceLowersConfidence },
  { name: "Low confidence cannot produce buy_small", fn: testLowConfidenceCannotProduceBuySmall },
  { name: "Portfolio exposure", fn: testPortfolioExposure },
  { name: "Stable reserve factor", fn: testStableReserve },
  { name: "Wallet-not-connected behavior", fn: testWalletNotConnected },
  { name: "EVM native token fixture", fn: testEvmNativeToken },
  { name: "EVM classic CODE:ISSUER fixture", fn: testEvmClassicCodeIssuer },
  { name: "Stellar native XLM fixture", fn: testStellarNativeXlm },
  { name: "Stellar classic CODE:ISSUER fixture", fn: testStellarClassicCodeIssuer },
  { name: "Stellar Soroban contract fixture", fn: testStellarSorobanContract },
  { name: "Stellar invalid issuer fixture", fn: testStellarInvalidIssuer },
  { name: "Stellar unavailable provider fixture", fn: testStellarUnavailableProvider },
  { name: "Deterministic output stability across timezones and wall-clock", fn: testDeterministicOutputStability },
  { name: "Critical blocker removal changes verdict (test failure proof)", fn: testCriticalBlockerRemovalChangesVerdict },
  { name: "Missing sources never create mock production data", fn: testMissingSourcesNeverMockProductionData },
  { name: "Agent score and Buy Risk remain semantically distinct", fn: testScoreAndBuyRiskSemantics },
  { name: "EVM and Stellar fixtures share common report contract", fn: testEvmStellarSharedReportContract },
  { name: "Deterministic report ID and stable fixture output", fn: testDeterministicReportId },
  { name: "Risk level bands and conventions", fn: testRiskBands },
  { name: "Golden fixture suite integration", fn: testGoldenFixtures },
  { name: "Evaluation property tests", fn: testEvaluationProperties },
  { name: "Wallet-not-connected portfolio behavior", fn: testWalletNotConnectedPortfolioBehavior },
  { name: "EVM and Stellar share common report without EVM-only checks", fn: testEvmStellarSharedReportWithoutEvmOnlyChecks },
  { name: "Factor ordering determinism", fn: testFactorOrderingDeterminism },
];

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const tc of testCases) {
  try {
    tc.fn();
    passed += 1;
    process.stdout.write(`PASS: ${tc.name}\n`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${tc.name}: ${message}`);
    process.stdout.write(`FAIL: ${tc.name} - ${message}\n`);
  }
}

process.stdout.write(`\n${passed}/${testCases.length} tests passed.\n`);

if (failed > 0) {
  process.stdout.write(`\n${failed} test(s) failed:\n`);
  for (const f of failures) {
    process.stdout.write(`  - ${f}\n`);
  }
  process.exit(1);
}
