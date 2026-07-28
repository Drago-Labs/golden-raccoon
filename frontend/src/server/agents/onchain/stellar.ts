import { Contract, StrKey, xdr } from "@stellar/stellar-sdk";
import type { AgentFinding, AgentResult, AgentSource } from "@/server/types";
import { buildAgentResult, weightedScore } from "@/server/agents/shared";
import { parseStellarAssetInput, type StellarAssetIdentity } from "@/server/stellar/assetIdentity";
import { createStellarDataServer, createStellarRpcServer, getStellarRpcHealth } from "@/server/stellar/client";

export type StellarOnchainAgentInput = {
  chain: string;
  contractAddress?: string;
  symbol?: string;
  issuer?: string;
  assetKey?: string;
  assetType?: "native" | "classic" | "sac" | "sep41" | "issuer_account";
};

type StellarAssetRecord = {
  asset_code: string;
  asset_issuer: string;
  contract_id?: string;
  num_liquidity_pools?: number;
  liquidity_pools_amount?: string;
  accounts?: {
    authorized?: number;
    authorized_to_maintain_liabilities?: number;
    unauthorized?: number;
  };
  flags?: {
    auth_required?: boolean;
    auth_revocable?: boolean;
    auth_immutable?: boolean;
    auth_clawback_enabled?: boolean;
  };
};

function severity(score: number): AgentFinding["severity"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function resolveIdentity(input: StellarOnchainAgentInput): StellarAssetIdentity | null {
  if (input.assetType === "classic" && input.symbol && input.issuer) {
    return parseStellarAssetInput(`${input.symbol}:${input.issuer}`, input.chain);
  }

  if (input.assetType === "native") return parseStellarAssetInput("native", input.chain);
  if (input.contractAddress) return parseStellarAssetInput(input.contractAddress, input.chain);

  return null;
}

async function getContractState(contractId: string, chain: string) {
  if (!StrKey.isValidContract(contractId)) return null;

  const { server } = createStellarRpcServer(chain);
  const footprint = new Contract(contractId).getFootprint();
  const response = await server.getLedgerEntries(footprint);
  const entry = response.entries[0];

  if (!entry || entry.val.switch() !== xdr.LedgerEntryType.contractData()) return null;

  const instance = entry.val.contractData().val().instance();
  const executable = instance.executable();
  const isSac = executable.switch() === xdr.ContractExecutableType.contractExecutableStellarAsset();
  const wasmHash = isSac ? undefined : Buffer.from(executable.wasmHash()).toString("hex");

  return {
    deployed: true,
    type: isSac ? "stellar_asset_contract" : "wasm_contract",
    wasmHash,
    lastModifiedLedgerSeq: entry.lastModifiedLedgerSeq,
    liveUntilLedgerSeq: entry.liveUntilLedgerSeq,
    latestLedger: response.latestLedger,
  };
}

async function getClassicAssetRecord(identity: StellarAssetIdentity, chain: string) {
  if (identity.type !== "classic") return null;

  const { server } = createStellarDataServer(chain);
  const page = await server.assets().forCode(identity.symbol).forIssuer(identity.issuer).limit(1).call();

  return (page.records[0] as StellarAssetRecord | undefined) ?? null;
}

async function getIssuerAccount(identity: StellarAssetIdentity, chain: string) {
  const issuer = identity.type === "classic" || identity.type === "issuer_account" ? identity.issuer : undefined;

  if (!issuer) return null;

  const { server } = createStellarDataServer(chain);

  return server.loadAccount(issuer);
}

export async function runStellarOnchainAgent(input: StellarOnchainAgentInput): Promise<AgentResult> {
  const identity = resolveIdentity(input);

  if (!identity) {
    return buildAgentResult({
      agent: "onchain",
      score: 82,
      verdict: "Invalid Stellar asset identity",
      summary: "Provide XLM, CODE:ISSUER, a Stellar G-address, or a Soroban C-address.",
      findings: [{ label: "Asset identity", severity: "critical", detail: "The Stellar asset identity could not be validated." }],
      sources: [],
      confidence: 0.2,
      recommendedAction: "manual_review",
    });
  }

  const startedAt = performance.now();
  const [healthResult, contractResult, assetResult, issuerResult] = await Promise.allSettled([
    getStellarRpcHealth(input.chain),
    "contractId" in identity ? getContractState(identity.contractId, input.chain) : Promise.resolve(null),
    getClassicAssetRecord(identity, input.chain),
    getIssuerAccount(identity, input.chain),
  ]);
  const checkedAt = new Date().toISOString();
  const health = healthResult.status === "fulfilled" ? healthResult.value : null;
  const contractState = contractResult.status === "fulfilled" ? contractResult.value : null;
  const assetRecord = assetResult.status === "fulfilled" ? assetResult.value : null;
  const issuerAccount = issuerResult.status === "fulfilled" ? issuerResult.value : null;
  const issuerFlags = assetRecord?.flags ?? issuerAccount?.flags;
  const native = identity.type === "native";
  const issuerExists = native || issuerAccount !== null;
  const authRequired = issuerFlags?.auth_required === true;
  const authRevocable = issuerFlags?.auth_revocable === true;
  const authClawback = issuerFlags?.auth_clawback_enabled === true;
  const authImmutable = issuerFlags?.auth_immutable === true;
  const liquidityPools = assetRecord?.num_liquidity_pools ?? 0;
  const liquidityAmount = Number(assetRecord?.liquidity_pools_amount ?? 0);
  const authorizedAccounts = assetRecord?.accounts?.authorized ?? 0;
  const unauthorizedAccounts = assetRecord?.accounts?.unauthorized ?? 0;
  const identityScore = native || assetRecord || contractState || issuerAccount ? 8 : 80;
  const issuerControlScore = native ? 0 : !issuerExists ? 90 : authClawback ? 70 : authRequired && authRevocable ? 62 : authRevocable ? 48 : authRequired ? 42 : authImmutable ? 8 : 25;
  const contractToken = identity.type === "sac" || identity.type === "sep41";
  const liquidityScore = native ? 8 : contractToken ? 55 : liquidityPools === 0 ? 72 : liquidityAmount <= 0 ? 58 : liquidityPools < 3 ? 42 : 18;
  const contractScore = contractState ? (contractState.type === "stellar_asset_contract" ? 8 : 28) : identity.type === "issuer_account" ? 35 : 78;
  const sourceScore = health && (assetRecord || contractState || native) ? 10 : health ? 42 : 78;
  const score = weightedScore([
    { score: identityScore, weight: 0.2 },
    { score: issuerControlScore, weight: 0.3 },
    { score: liquidityScore, weight: 0.2 },
    { score: contractScore, weight: 0.2 },
    { score: sourceScore, weight: 0.1 },
  ]);
  const findings: AgentFinding[] = [
    {
      label: "Asset identity",
      severity: severity(identityScore),
      scoreImpact: identityScore,
      detail: native
        ? "Native XLM identity was resolved."
        : assetRecord
          ? `${assetRecord.asset_code}:${assetRecord.asset_issuer} was resolved from live Stellar asset data.`
          : contractState
            ? `${identity.assetKey} is deployed on the selected Stellar network.`
            : issuerAccount
              ? "The issuer account exists, but a specific issued asset was not selected."
              : "The asset could not be confirmed from connected Stellar sources.",
    },
    {
      label: "Issuer controls",
      severity: severity(issuerControlScore),
      scoreImpact: issuerControlScore,
      detail: native
        ? "XLM has no asset issuer."
        : !issuerExists
          ? "The issuer account could not be confirmed."
          : `Authorization required: ${authRequired ? "yes" : "no"}; revocable: ${authRevocable ? "yes" : "no"}; immutable: ${authImmutable ? "yes" : "no"}.`,
    },
    {
      label: "Clawback capability",
      severity: authClawback ? "high" : "low",
      scoreImpact: authClawback ? 70 : 8,
      detail: native ? "Native XLM cannot be clawed back by an issuer." : authClawback ? "Issuer-level clawback capability is enabled." : "No issuer clawback flag was reported.",
    },
    {
      label: "Trustline state",
      severity: unauthorizedAccounts > 0 ? "high" : authorizedAccounts > 0 || native ? "low" : "medium",
      scoreImpact: unauthorizedAccounts > 0 ? 62 : authorizedAccounts > 0 || native ? 10 : 38,
      detail: native
        ? "XLM does not require a trustline."
        : `Authorized accounts: ${authorizedAccounts.toLocaleString("en-US")}; unauthorized accounts: ${unauthorizedAccounts.toLocaleString("en-US")}.`,
    },
    {
      label: "Liquidity",
      severity: severity(liquidityScore),
      scoreImpact: liquidityScore,
      detail: native
        ? "XLM is the native network asset."
        : contractToken
          ? "Generic Soroban contract liquidity requires a protocol-specific market adapter."
          : `${liquidityPools} Stellar liquidity pool(s) report ${liquidityAmount.toLocaleString("en-US")} units.`,
    },
    {
      label: "Contract interface",
      severity: severity(contractScore),
      scoreImpact: contractScore,
      detail: contractState
        ? contractState.type === "stellar_asset_contract"
          ? "The contract is a built-in Stellar Asset Contract implementing the standard asset interface."
          : "A deployed Soroban WASM contract was confirmed; SEP-41 behavior still requires method simulation."
        : "No deployed Soroban contract instance was confirmed for this identity.",
    },
    {
      label: "Contract storage",
      severity: contractState?.liveUntilLedgerSeq ? "low" : "medium",
      scoreImpact: contractState?.liveUntilLedgerSeq ? 12 : 38,
      detail: contractState?.liveUntilLedgerSeq
        ? `Contract state is live until ledger ${contractState.liveUntilLedgerSeq}.`
        : "Contract storage TTL was unavailable or not applicable.",
    },
    {
      label: "Data quality",
      severity: severity(sourceScore),
      scoreImpact: sourceScore,
      detail: health
        ? `Stellar RPC is healthy at ledger ${health.latestLedger}.`
        : "Stellar RPC health or network identity could not be verified.",
    },
  ];
  const sources: AgentSource[] = [
    {
      label: "Stellar RPC",
      status: health ? "connected" : "unavailable",
      detail: health ? `Network verified at ledger ${health.latestLedger}.` : "RPC health or passphrase verification failed.",
      checkedAt,
      latencyMs: health?.latencyMs,
      reliability: health ? 0.96 : 0.1,
    },
    {
      label: "Stellar asset data",
      status: native || assetRecord || issuerAccount ? "connected" : "unavailable",
      detail: native
        ? "Native asset requires no issuer lookup."
        : assetRecord
          ? "Classic asset, issuer controls, holder authorization counts, and pool counts returned."
          : issuerAccount
            ? "Issuer account returned; select CODE:ISSUER for asset-specific data."
            : "Asset and issuer data were unavailable.",
      checkedAt,
      latencyMs: Math.round(performance.now() - startedAt),
      reliability: assetRecord || native ? 0.88 : issuerAccount ? 0.62 : 0.12,
    },
    {
      label: "Soroban contract state",
      status: contractState ? "connected" : identity.type === "issuer_account" ? "unavailable" : "unavailable",
      detail: contractState ? `${contractState.type} confirmed from ledger entries.` : "Contract instance data was unavailable or not applicable.",
      checkedAt,
      reliability: contractState ? 0.96 : 0.15,
    },
  ];
  const criticalIdentityFailure = identityScore >= 75;
  const recommendedAction = criticalIdentityFailure || score >= 75 ? "avoid" : score >= 50 ? "manual_review" : score >= 25 ? "watch" : "hold";

  return buildAgentResult({
    agent: "onchain",
    score,
    verdict: score >= 75 ? "Critical Stellar risk" : score >= 50 ? "High Stellar risk" : score >= 25 ? "Stellar review needed" : "No major Stellar flags",
    summary: `Checked ${identity.assetKey} on ${input.chain}. Issuer-control score ${issuerControlScore}/100, liquidity score ${liquidityScore}/100, contract score ${contractScore}/100.`,
    findings,
    sources,
    confidence: health && (assetRecord || contractState || native) ? 0.84 : health ? 0.58 : 0.28,
    recommendedAction,
    blockingReasons: criticalIdentityFailure ? ["Stellar asset identity could not be confirmed from connected sources."] : [],
    rawSignals: {
      chainSupport: { requestedChain: input.chain, chainFamily: "stellar" },
      stellarIdentity: identity,
      issuerControls: { issuerExists, authRequired, authRevocable, authClawback, authImmutable },
      holders: { authorizedAccounts, unauthorizedAccounts },
      liquidity: { poolCount: liquidityPools, poolAmount: liquidityAmount },
      contractIdentity: contractState,
      rpcHealth: health,
    },
  });
}
