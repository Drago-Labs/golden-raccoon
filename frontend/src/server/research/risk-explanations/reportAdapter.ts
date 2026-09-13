/**
 * Local adaptation of the shared `RiskReport` contract.
 *
 * Nothing outside this module reads the raw report: the rest of the feature
 * works against `AdaptedReport`, so a change to the shared contract lands in
 * exactly one place. The adapter never mutates its input.
 */
import {
  EXPLANATION_LIMITS,
  ExplanationValidationError,
  SUPPORTED_REPORT_VERSIONS,
  explanationReportSchema,
  type CanonicalAssetIdentity,
  type ExplanationAgentCard,
  type ExplanationReport,
  type ExplanationSubject,
} from "./schema";

export type AdaptedReport = {
  reportVersion: string;
  subject: ExplanationSubject;
  agentCards: ExplanationAgentCard[];
  report: ExplanationReport;
};

function chainFamily(chain: string): CanonicalAssetIdentity["family"] {
  const normalized = chain.trim().toLowerCase();
  if (normalized.startsWith("stellar")) return "stellar";
  if (normalized.length === 0) return "unknown";
  return "evm";
}

/**
 * Builds an identity that stays distinct across networks. Two `USDC` entries on
 * different Stellar networks, or the same symbol on Ethereum and Base, produce
 * different keys because the chain id is always the first segment.
 */
export function canonicalAssetIdentity(report: ExplanationReport): CanonicalAssetIdentity {
  const chain = (report.input?.chain ?? report.chain).trim();
  const family = chainFamily(chain);
  const contractAddress = (report.contractAddress ?? report.input?.contractAddress)?.trim() || undefined;
  const issuer = report.input?.issuer?.trim() || undefined;
  const assetType = report.input?.assetType?.trim() || undefined;
  const symbol = report.symbol.trim();

  const discriminator =
    report.input?.assetKey?.trim() ||
    (issuer ? `${symbol}:${issuer}` : undefined) ||
    (contractAddress ? contractAddress.toLowerCase() : undefined) ||
    symbol;

  return {
    chain,
    family,
    symbol,
    assetType,
    contractAddress,
    issuer,
    identityKey: `${chain}|${assetType ?? "unknown"}|${discriminator}`,
  };
}

/**
 * Validates and adapts a report. Throws `ExplanationValidationError` for an
 * unsupported version, an oversized payload or a shape this version cannot read.
 */
export function adaptReport(input: unknown, reportVersion: string): AdaptedReport {
  if (!(SUPPORTED_REPORT_VERSIONS as readonly string[]).includes(reportVersion)) {
    throw new ExplanationValidationError(
      "unsupported_report_version",
      `Report version ${reportVersion} is not supported by this explanation schema.`,
      { supported: SUPPORTED_REPORT_VERSIONS },
    );
  }

  const parsed = explanationReportSchema.safeParse(input);

  if (!parsed.success) {
    throw new ExplanationValidationError("invalid_report", "The supplied risk report could not be read.", parsed.error.flatten());
  }

  const report = parsed.data;
  const totalFactors = report.agentCards.reduce((sum, card) => sum + card.factors.length, 0);

  if (totalFactors > EXPLANATION_LIMITS.maxTotalFactors) {
    throw new ExplanationValidationError(
      "report_too_large",
      `The report carries ${totalFactors} factors, above the ${EXPLANATION_LIMITS.maxTotalFactors} factor analysis bound.`,
      { totalFactors, limit: EXPLANATION_LIMITS.maxTotalFactors },
    );
  }

  const subject: ExplanationSubject = {
    reportId: report.id,
    reportVersion,
    reportCreatedAt: report.createdAt,
    asset: canonicalAssetIdentity(report),
    buyRisk: report.buyRisk,
    confidence: report.confidence,
    verdict: report.verdict,
    summary: report.summary,
  };

  return {
    reportVersion,
    subject,
    agentCards: report.agentCards,
    report,
  };
}

/**
 * Snapshot used by tests and by the service to assert that analysis left the
 * caller's report byte-equivalent.
 */
export function reportFingerprint(report: unknown): string {
  return JSON.stringify(report);
}
