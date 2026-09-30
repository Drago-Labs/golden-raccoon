import { coverageRatioBps } from "./coverageMath";
import type { AssetIssuerAnalysis, EvidenceEntry, RegistryEntryInput, ReportInput, ReportStatus } from "./schema";

function registryKey(assetCode: string, issuer: string): string {
  return `${assetCode.toLowerCase()}::${issuer.toLowerCase()}`;
}

function classifyStatus(report: ReportInput, registryEntry: RegistryEntryInput, lateAfterSeconds: number): ReportStatus {
  if (registryEntry.permittedSourceLabels.length > 0 && !registryEntry.permittedSourceLabels.includes(report.sourceLabel)) {
    return "unlisted_source";
  }
  const lateness = (Date.parse(report.retrievedAt) - Date.parse(report.reportingPeriodEnd)) / 1000;
  return lateness > lateAfterSeconds ? "late" : "on_time";
}

function buildEvidence(reports: ReportInput[], registryEntry: RegistryEntryInput, lateAfterSeconds: number): EvidenceEntry[] {
  // A currency inconsistent with the first report seen for this asset+issuer
  // makes every figure for that report non-comparable: two reports naming
  // different currencies never produce one ratio.
  const referenceCurrency = reports[0]?.currency ?? null;
  const supersededHashes = new Set(reports.map((r) => r.revisionOf).filter((hash): hash is string => Boolean(hash)));

  return reports.map((report) => {
    const status = classifyStatus(report, registryEntry, lateAfterSeconds);
    const currencyMismatch = referenceCurrency !== null && report.currency !== referenceCurrency;

    let ratio: number | null = null;
    let note = "";
    if (currencyMismatch) {
      note = `Reported in ${report.currency}, which differs from this asset/issuer's first-seen currency (${referenceCurrency}); no ratio is computed across mismatched units.`;
    } else {
      try {
        ratio = coverageRatioBps(report.claimedAssets, report.claimedLiabilities);
        if (ratio === null) note = "Claimed liabilities are zero; a coverage ratio cannot be computed from this report.";
      } catch {
        note = "Claimed figures could not be parsed as decimal amounts.";
      }
    }

    return {
      documentHash: report.documentHash,
      documentUrl: report.documentUrl,
      retrievedAt: report.retrievedAt,
      sourceType: report.sourceType,
      sourceLabel: report.sourceLabel,
      reportingPeriodStart: report.reportingPeriodStart,
      reportingPeriodEnd: report.reportingPeriodEnd,
      status,
      currency: report.currency,
      claimedAssets: report.claimedAssets,
      claimedLiabilities: report.claimedLiabilities,
      coverageRatioBps: ratio,
      coverageNote: note,
      supersedes: report.revisionOf ? [report.revisionOf] : [],
      superseded: supersededHashes.has(report.documentHash),
    };
  });
}

export function analyseRegistryEntry(registryEntry: RegistryEntryInput, allReports: ReportInput[], lateAfterSeconds: number): AssetIssuerAnalysis {
  const key = registryKey(registryEntry.assetCode, registryEntry.issuer);
  const matched = allReports
    .filter((report) => registryKey(report.assetCode, report.issuer) === key)
    .sort((a, b) => Date.parse(a.reportingPeriodEnd) - Date.parse(b.reportingPeriodEnd));

  const evidence = buildEvidence(matched, registryEntry, lateAfterSeconds);
  const currentEvidence = evidence.filter((entry) => !entry.superseded);
  const latest = currentEvidence.at(-1) ?? null;

  return {
    registryEntry,
    evidence,
    latestCoverageRatioBps: latest?.coverageRatioBps ?? null,
    state: evidence.length === 0 ? "no_evidence" : currentEvidence.some((e) => e.coverageRatioBps === null) ? "partial" : "complete",
  };
}

export function findUnregisteredReports(registry: RegistryEntryInput[], reports: ReportInput[]): Array<{ assetCode: string; issuer: string; documentHash: string }> {
  const keys = new Set(registry.map((entry) => registryKey(entry.assetCode, entry.issuer)));
  return reports.filter((report) => !keys.has(registryKey(report.assetCode, report.issuer))).map((report) => ({ assetCode: report.assetCode, issuer: report.issuer, documentHash: report.documentHash }));
}
