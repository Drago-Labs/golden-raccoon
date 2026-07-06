import type { AgentResult } from "@/server/types";
import { NoDataState } from "@/components/NoDataState";

function isAgentResultForUi(result: AgentResult) {
  return Boolean(
    result &&
      typeof result.agent === "string" &&
      typeof result.verdict === "string" &&
      typeof result.summary === "string" &&
      typeof result.score === "number" &&
      typeof result.confidence === "number" &&
      Array.isArray(result.findings) &&
      Array.isArray(result.sources) &&
      Array.isArray(result.missingData) &&
      result.dataQuality &&
      typeof result.dataQuality.detail === "string",
  );
}

function getRawPreview(rawSignals?: Record<string, unknown>) {
  if (!rawSignals) return [];

  return Object.entries(rawSignals)
    .slice(0, 4)
    .map(([key, value]) => {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);

      return `${key}: ${serialized?.slice(0, 160)}`;
    });
}

function getCriticalBlockers(result: AgentResult) {
  return [
    ...result.blockingReasons,
    ...result.findings.filter((finding) => finding.severity === "critical").map((finding) => `${finding.label}: ${finding.detail}`),
  ].slice(0, 4);
}

export function AgentResultPanel({ result }: { result: AgentResult }) {
  if (!isAgentResultForUi(result)) {
    return (
      <NoDataState
        title="Invalid agent result"
        detail="The agent result failed the UI contract boundary and cannot be treated as a safe signal."
      />
    );
  }

  const explanation = result.rawSignals?.explanation as
    | {
        confidenceExplanation?: string;
        evidence?: string[];
        missingData?: string[];
      }
    | undefined;
  const topFindings = result.findings.slice(0, 5);
  const rawPreview = getRawPreview(result.rawSignals);
  const criticalBlockers = getCriticalBlockers(result);
  const hasMockData = result.dataQuality.mockSources > 0 || result.sources.some((source) => source.status === "mock");
  const manualReview = result.recommendedAction === "manual_review" || result.status === "manual_review_required";

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="text-sm uppercase tracking-[0.14em] text-[#d9a441]">{result.agent}</div>
          <h3 className="mt-1 text-lg font-semibold">{result.verdict}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/58">{result.score}/100</span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-sm capitalize text-white/58">{result.riskLevel} risk</span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-sm capitalize text-white/58">
            {result.recommendedAction.replaceAll("_", " ")}
          </span>
          <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-white/58">
            {Math.round(result.confidence * 100)}% confidence
          </span>
        </div>
      </div>
      <div className="mt-3 text-sm leading-6 text-white/56">{result.summary}</div>

      {criticalBlockers.length > 0 ? (
        <div className="mt-4 rounded-xl border border-red-300/25 bg-red-500/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-200">Critical blockers</div>
          <div className="mt-2 space-y-2">
            {criticalBlockers.map((item) => (
              <div key={item} className="text-xs leading-5 text-red-100/82">
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {manualReview ? (
        <div className="mt-4 rounded-xl border border-[#d9a441]/25 bg-[#d9a441]/10 p-3 text-xs leading-5 text-[#f2c86d]">
          Manual review required. This result shows risks, evidence, missing data and confidence; it is not a buy/sell guarantee.
        </div>
      ) : null}

      {hasMockData ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-white/6 p-3 text-xs leading-5 text-white/56">
          Demo/mock source data is explicitly marked in the source list and is not hidden.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-white/6 p-3">
          <div className="text-xs text-white/38">Score breakdown</div>
          <div className="mt-2 space-y-2">
            {topFindings.slice(0, 3).map((finding) => (
              <div key={finding.label} className="text-xs leading-5 text-white/54">
                {finding.label}: {finding.scoreImpact ?? finding.severity}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white/6 p-3">
          <div className="text-xs text-white/38">Source list</div>
          <div className="mt-2 space-y-2">
            {result.sources.slice(0, 4).map((source) => (
              <div key={source.label} className="text-xs leading-5 text-white/54">
                {source.label}: {source.status}
                {source.checkedAt ? `, checked ${source.checkedAt}` : ""}
                {typeof source.reliability === "number" ? `, ${Math.round(source.reliability * 100)}% confidence` : ""}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-white/6 p-3">
          <div className="text-xs text-white/38">Missing data</div>
          <div className="mt-2 space-y-2">
            {result.missingData.length > 0 ? (
              result.missingData.slice(0, 3).map((item) => (
                <div key={`${item.field}:${item.reason}`} className="text-xs leading-5 text-white/54">
                  {item.field}: {item.impact}
                </div>
              ))
            ) : (
              <div className="text-xs leading-5 text-white/54">No material missing data reported.</div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-white/6 p-3">
          <div className="text-xs text-white/38">Risk and confidence</div>
          <div className="mt-2 text-xs leading-5 text-white/54">
            Risk: {result.riskScore}/100 ({result.riskLevel}). Confidence: {Math.round(result.confidence * 100)}%. Data quality: {result.dataQuality.mode}.
          </div>
        </div>
        <div className="rounded-xl bg-white/6 p-3">
          <div className="text-xs text-white/38">Confidence explanation</div>
          <div className="mt-2 text-xs leading-5 text-white/54">
            {explanation?.confidenceExplanation ?? result.dataQuality.detail}
          </div>
        </div>
        <div className="rounded-xl bg-white/6 p-3">
          <div className="text-xs text-white/38">Raw evidence snippets</div>
          <div className="mt-2 space-y-2">
            {(rawPreview.length > 0 ? rawPreview : ["No raw signal preview available."]).map((item) => (
              <div key={item} className="break-words text-xs leading-5 text-white/54">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {explanation?.evidence?.length ? (
        <div className="mt-4 rounded-xl border border-[#d9a441]/20 bg-[#d9a441]/8 p-3">
          <div className="text-xs text-[#d9a441]">Why this decision</div>
          <div className="mt-2 space-y-2">
            {explanation.evidence.slice(0, 3).map((item) => (
              <div key={item} className="text-xs leading-5 text-white/58">
                {item}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
