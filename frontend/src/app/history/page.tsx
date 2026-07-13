import { AppShell } from "@/components/AppShell";
import { listAgentRunRecords, listApprovalRecords, listRecommendationRecords, listTransactionRecords } from "@/server/storage";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const agentRuns = listAgentRunRecords();
  const recommendations = listRecommendationRecords();
  const approvals = listApprovalRecords();
  const transactions = listTransactionRecords();

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-tight">History</h1>
          <div className="flex gap-4 text-sm text-white/46">
            <span>{recommendations.length} recommendations</span>
            <span>{approvals.length} approvals</span>
            <span>{transactions.length} transactions</span>
          </div>
        </section>
        <section className="glass-panel rounded-lg p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-semibold">Agent runs</h2>
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

        <details className="glass-panel rounded-lg p-5">
          <summary className="cursor-pointer text-sm font-semibold text-white/72">Recent activity</summary>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div>
            <div className="text-sm uppercase tracking-[0.16em] text-[#d9a441]">Recommendations</div>
            <div className="mt-4 space-y-3">
              {recommendations.length > 0 ? (
                recommendations.slice(0, 5).map((recommendation) => (
                  <div key={recommendation.id} className="rounded-2xl bg-white/6 p-4">
                    <div className="text-sm font-semibold capitalize">{recommendation.action.replaceAll("_", " ")}</div>
                    <div className="mt-1 text-xs leading-5 text-white/44">{recommendation.summary}</div>
                    <div className="mt-3 flex justify-between text-xs text-white/38">
                      <span>{recommendation.decisionScore}/100</span>
                      <span>{Math.round(recommendation.confidence * 100)}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/42">No recommendation records yet.</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm uppercase tracking-[0.16em] text-[#d9a441]">Approvals</div>
            <div className="mt-4 space-y-3">
              {approvals.length > 0 ? (
                approvals.slice(0, 5).map((approval) => (
                  <div key={approval.id} className="rounded-2xl bg-white/6 p-4">
                    <div className="text-sm font-semibold">Wallet confirmed</div>
                    <div className="mt-1 break-all text-xs leading-5 text-white/44">{approval.txHash}</div>
                    <div className="mt-3 text-xs text-white/38">{new Date(approval.createdAt).toLocaleString("en-US")}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/42">No wallet approvals yet.</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm uppercase tracking-[0.16em] text-[#d9a441]">Transactions</div>
            <div className="mt-4 space-y-3">
              {transactions.length > 0 ? (
                transactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.hash} className="rounded-2xl bg-white/6 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold capitalize">{transaction.type.replaceAll("_", " ")}</div>
                      <div className="text-xs text-white/38">{transaction.status}</div>
                    </div>
                    <div className="mt-1 break-all text-xs leading-5 text-white/44">{transaction.hash}</div>
                    <div className="mt-3 text-xs text-white/38">{transaction.network}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/42">No stored transactions yet.</div>
              )}
            </div>
          </div>
          </div>
        </details>
      </div>
    </AppShell>
  );
}
