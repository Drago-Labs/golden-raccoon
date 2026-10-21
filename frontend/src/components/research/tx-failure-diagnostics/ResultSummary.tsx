import type { DiagnosisReport } from "@/server/research/tx-failure-diagnostics/schema";

export function ResultSummary({ report }: { report: DiagnosisReport }) {
  return (
    <section data-testid="result-summary" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Result</h2>
      <p className="font-mono text-sm">{report.transactionCode ?? "unavailable"}</p>
      <p className="text-sm text-muted">{report.transactionExplanation}</p>
      {report.feeChargedStroops ? <p className="text-sm">Fee charged: {report.feeChargedStroops} stroops</p> : null}
      {report.transactionLevel ? <p className="text-sm">This failure happened before any operation ran.</p> : null}
      {report.feeBump ? (
        <div data-testid="fee-bump-summary" className="text-sm">
          <p>Outer result: {report.feeBump.outerCode}</p>
          <p>Inner result: {report.feeBump.innerCode}</p>
          <p>Inner fee charged: {report.feeBump.innerFeeChargedStroops} stroops</p>
        </div>
      ) : null}
    </section>
  );
}
