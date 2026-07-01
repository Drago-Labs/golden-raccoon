import { AppShell } from "@/components/AppShell";
import { listAgentRunRecords } from "@/server/storage";
import { getMockDecisionHistory } from "@/server/agent";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const agentRuns = listAgentRunRecords();
  const decisions = getMockDecisionHistory();

  return (
    <AppShell>
      <div className="space-y-8">
        <section>
          <div className="text-sm uppercase tracking-[0.2em] text-[#d9a441]">History</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Agent decisions</h1>
        </section>
        <section className="glass-panel rounded-[28px] p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">Agent runs</h2>
              <div className="mt-1 text-sm text-white/42">Dashboard decisions, recommendations and source coverage.</div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs text-white/46">
              {agentRuns.length} saved run{agentRuns.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/36">
                <tr>
                  <th className="pb-3 font-medium">Recommendation</th>
                  <th className="pb-3 font-medium">Target</th>
                  <th className="pb-3 font-medium">Score</th>
                  <th className="pb-3 font-medium">Confidence</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {agentRuns.length > 0 ? (
                  agentRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="py-4">
                        <div className="font-semibold capitalize">{run.recommendation.replaceAll("_", " ")}</div>
                        <div className="mt-1 max-w-xl text-xs text-white/42">{run.summary}</div>
                      </td>
                      <td className="py-4 text-white/64">
                        {run.targetToken?.symbol ?? "Portfolio"}
                        {run.targetToken?.riskScore ? <span className="ml-2 text-white/34">{run.targetToken.riskScore}/100</span> : null}
                      </td>
                      <td className="py-4 text-white/70">{run.decisionScore}/100</td>
                      <td className="py-4 text-white/70">{Math.round(run.confidence * 100)}%</td>
                      <td className="py-4">
                        <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs capitalize">
                          {run.status}
                        </span>
                      </td>
                      <td className="py-4 text-white/58">{new Date(run.createdAt).toLocaleString("en-US")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-white/42">
                      No saved agent runs yet. Run agents from the dashboard to create the first record.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="glass-panel rounded-[28px] p-6">
          <h2 className="text-xl font-semibold">Legacy decisions</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-white/36">
                <tr>
                  <th className="pb-3 font-medium">Decision</th>
                  <th className="pb-3 font-medium">Risk</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Tx hash</th>
                  <th className="pb-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {decisions.map((decision) => (
                  <tr key={`${decision.createdAt}-${decision.decision}`}>
                    <td className="py-4">
                      <div className="font-semibold">{decision.decision}</div>
                      <div className="mt-1 max-w-xl text-xs text-white/42">{decision.summary}</div>
                    </td>
                    <td className="py-4 text-white/70">{decision.riskScore}/100</td>
                    <td className="py-4">
                      <span className="rounded-full border border-white/10 bg-white/7 px-3 py-1 text-xs capitalize">
                        {decision.status}
                      </span>
                    </td>
                    <td className="py-4 text-white/58">{decision.txHash ?? "No transaction"}</td>
                    <td className="py-4 text-white/58">{new Date(decision.createdAt).toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
