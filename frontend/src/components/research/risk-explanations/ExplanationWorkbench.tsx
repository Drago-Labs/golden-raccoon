"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LiveRegion } from "@/components/a11y/LiveRegion";
import { ConfidencePanel } from "./ConfidencePanel";
import { ContributionTable } from "./ContributionTable";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ExplanationTree } from "./ExplanationTree";
import type { RiskExplanation } from "@/server/research/risk-explanations/schema";

/**
 * In-memory handoff between a risk score card and the workbench.
 *
 * The staged report never reaches storage: it lives in a module-scoped map
 * keyed by wallet session, is removed the moment it is read, and is dropped
 * wholesale whenever the active account or network changes.
 */
export type StagedReport = { sessionKey: string; report: unknown };

const stagedReports = new Map<string, unknown>();

export function sessionKeyFor(account: string | null | undefined, network: string | null | undefined): string {
  return `${(account ?? "anonymous").toLowerCase()}|${network ?? "unknown"}`;
}

export function stageExplanationReport(sessionKey: string, report: unknown): string {
  const token = `${sessionKey}::${Date.now().toString(36)}`;
  stagedReports.set(token, report);
  return token;
}

export function takeStagedReport(token: string, sessionKey: string): unknown | null {
  if (!token.startsWith(`${sessionKey}::`)) return null;
  const report = stagedReports.get(token) ?? null;
  stagedReports.delete(token);
  return report;
}

export function clearStagedReports(): void {
  stagedReports.clear();
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; explanation: RiskExplanation; contradictions: string[] }
  | { status: "error"; code: string; message: string };

type Filters = { agent: string; category: string; kind: string; evidence: string };

const EMPTY_FILTERS: Filters = { agent: "all", category: "all", kind: "all", evidence: "all" };

/**
 * Evidence-linked explanation workbench.
 *
 * `account` and `network` identify the wallet session the staged report came
 * from. The wrapper remounts the session component whenever that identity or
 * the staged token changes, so no state derived from a previous wallet or
 * network can survive the switch.
 */
export function ExplanationWorkbench(props: {
  account?: string | null;
  network?: string | null;
  handoffToken?: string | null;
  endpoint?: string;
}) {
  const sessionKey = sessionKeyFor(props.account, props.network);

  return (
    <WorkbenchSession
      key={`${sessionKey}::${props.handoffToken ?? "none"}`}
      sessionKey={sessionKey}
      handoffToken={props.handoffToken ?? null}
      endpoint={props.endpoint ?? "/api/insights/risk-explanations"}
    />
  );
}

function WorkbenchSession({
  sessionKey,
  handoffToken,
  endpoint,
}: {
  sessionKey: string;
  handoffToken: string | null;
  endpoint: string;
}) {
  const [state, setState] = useState<FetchState>({ status: "idle" });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!handoffToken) return;

    const report = takeStagedReport(handoffToken, sessionKey);

    if (!report) return;

    generation.current += 1;
    const requestGeneration = generation.current;

    Promise.resolve()
      .then(() => {
        if (requestGeneration !== generation.current) return null;
        setState({ status: "loading" });

        return fetch(endpoint, {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reportVersion: "risk-report/v1", report }),
        });
      })
      .then(async (response) => {
        if (!response || requestGeneration !== generation.current) return;

        const payload = await response.json();

        if (requestGeneration !== generation.current) return;

        if (!response.ok) {
          setState({
            status: "error",
            code: typeof payload?.error === "string" ? payload.error : "explanation_failed",
            message: typeof payload?.message === "string" ? payload.message : "The report could not be analysed.",
          });
          return;
        }

        setState({ status: "ready", explanation: payload.explanation, contradictions: payload.contradictions ?? [] });
      })
      .catch(() => {
        if (requestGeneration !== generation.current) return;
        setState({ status: "error", code: "network_error", message: "The analysis request could not be completed." });
      });

    return () => {
      generation.current += 1;
      clearStagedReports();
    };
  }, [endpoint, handoffToken, sessionKey]);

  const explanation = state.status === "ready" ? state.explanation : null;

  const agents = useMemo(() => {
    if (!explanation) return [] as Array<{ value: string; label: string }>;
    const seen = new Map<string, string>();
    for (const contribution of explanation.contributions) {
      if (!seen.has(contribution.agent)) seen.set(contribution.agent, contribution.agentDisplayName);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [explanation]);

  const categories = useMemo(() => {
    if (!explanation) return [] as string[];
    return [...new Set(explanation.contributions.map((contribution) => contribution.category))].sort();
  }, [explanation]);

  const filtered = useMemo(() => {
    if (!explanation) return [];
    return explanation.contributions.filter((contribution) => {
      if (filters.agent !== "all" && contribution.agent !== filters.agent) return false;
      if (filters.category !== "all" && contribution.category !== filters.category) return false;
      if (filters.kind !== "all" && contribution.kind !== filters.kind) return false;
      if (filters.evidence !== "all" && contribution.evidence.state !== filters.evidence) return false;
      return true;
    });
  }, [explanation, filters]);

  const selected = useMemo(() => {
    if (!explanation || !selectedKey) return null;
    return explanation.contributions.find((contribution) => contribution.key === selectedKey) ?? null;
  }, [explanation, selectedKey]);

  const selectedSource = useMemo(() => {
    if (!explanation || !selected) return null;
    const label = selected.evidence.source?.label ?? selected.evidence.claimedLabel;
    if (!label) return null;
    return explanation.sources.find((source) => source.label === label) ?? null;
  }, [explanation, selected]);

  const statusMessage =
    state.status === "loading"
      ? "Analysing the selected report."
      : state.status === "error"
        ? `Analysis failed: ${state.message}`
        : explanation
          ? `Analysis ready. ${filtered.length} of ${explanation.contributions.length} contributions shown.`
          : "";

  return (
    <div className="space-y-6" data-testid="explanation-workbench">
      <LiveRegion message={statusMessage} />

      {state.status === "idle" ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No report is selected. Open this workbench from a risk score card to inspect how a report&apos;s factors relate to
          its displayed result. Reports are held in memory for the current wallet session only.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-white/10 px-4 py-6 text-sm text-subtle">
          Analysing the selected report…
        </p>
      ) : null}

      {state.status === "error" ? (
        <div role="alert" className="rounded-xl border border-red-300/35 bg-red-400/8 px-4 py-4 text-sm text-red-200">
          <p className="font-semibold">The report could not be analysed.</p>
          <p className="mt-1 text-xs">{state.message}</p>
          <p className="mt-1 font-mono text-[11px] opacity-80">{state.code}</p>
        </div>
      ) : null}

      {explanation ? (
        <>
          <section aria-labelledby="explanation-subject-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="explanation-subject-heading" className="text-sm font-semibold">
              {explanation.subject.asset.symbol} on {explanation.subject.asset.chain}
            </h2>
            <p className="mt-1 text-xs text-subtle">
              Report {explanation.subject.reportId} · verdict {explanation.subject.verdict} · buy risk{" "}
              {explanation.subject.buyRisk}/100 · confidence {Math.round(explanation.subject.confidence * 100)}%
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-subtle">{explanation.subject.asset.identityKey}</p>
            <p className="mt-2 text-xs text-subtle">
              Coverage: {explanation.coverage.state}. {explanation.coverage.note}
            </p>
          </section>

          {explanation.criticalBlockers.length > 0 ? (
            <section aria-labelledby="explanation-blockers-heading" className="rounded-xl border border-red-300/35 p-4">
              <h2 id="explanation-blockers-heading" className="text-sm font-semibold text-red-200">
                Critical blockers ({explanation.criticalBlockers.length})
              </h2>
              <p className="mt-1 text-xs text-subtle">
                These stay listed whatever the filter hides below.
              </p>
              <ul className="mt-2 space-y-1 text-xs" data-testid="critical-blockers">
                {explanation.criticalBlockers.map((blocker) => (
                  <li key={blocker.key}>
                    <span className="font-medium">{blocker.label}</span>{" "}
                    <span className="text-subtle">
                      — {blocker.agentDisplayName} · {blocker.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="explanation-filters-heading" className="rounded-xl border border-white/10 p-4">
            <h2 id="explanation-filters-heading" className="text-sm font-semibold">
              Filter contributions
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs">
                <span className="block text-subtle">Agent</span>
                <select
                  value={filters.agent}
                  onChange={(event) => setFilters((current) => ({ ...current, agent: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-2 py-1.5"
                >
                  <option value="all">All agents</option>
                  {agents.map((agent) => (
                    <option key={agent.value} value={agent.value}>
                      {agent.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="block text-subtle">Category</span>
                <select
                  value={filters.category}
                  onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-2 py-1.5"
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="block text-subtle">Kind</span>
                <select
                  value={filters.kind}
                  onChange={(event) => setFilters((current) => ({ ...current, kind: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-2 py-1.5"
                >
                  <option value="all">Scored and descriptive</option>
                  <option value="scored">Scored only</option>
                  <option value="descriptive">Descriptive only</option>
                </select>
              </label>
              <label className="text-xs">
                <span className="block text-subtle">Evidence</span>
                <select
                  value={filters.evidence}
                  onChange={(event) => setFilters((current) => ({ ...current, evidence: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-transparent px-2 py-1.5"
                >
                  <option value="all">Any evidence state</option>
                  <option value="resolved">Source linked</option>
                  <option value="label_only">Label only</option>
                  <option value="unlinked">No source named</option>
                  <option value="ambiguous">Ambiguous</option>
                </select>
              </label>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <section aria-labelledby="explanation-table-heading">
                <h2 id="explanation-table-heading" className="text-sm font-semibold">
                  Contributions ({filtered.length} of {explanation.contributions.length})
                </h2>
                <div className="mt-3">
                  <ContributionTable
                    contributions={filtered}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                    caption="Every factor the report recorded, with its agent, recorded impact and evidence state"
                  />
                </div>
              </section>

              <section aria-labelledby="explanation-tree-heading">
                <h2 id="explanation-tree-heading" className="text-sm font-semibold">
                  Drill-down
                </h2>
                <p className="mt-1 text-xs text-subtle">
                  Arrow keys move and expand, Enter opens the evidence for a factor.
                </p>
                <div className="mt-3">
                  <ExplanationTree root={explanation.tree} onSelectContribution={setSelectedKey} selectedKey={selectedKey} />
                </div>
              </section>
            </div>

            <div className="space-y-6">
              <EvidenceDrawer contribution={selected} source={selectedSource} onClose={() => setSelectedKey(null)} />
              <ConfidencePanel
                reconciliation={explanation.reconciliation}
                gaps={explanation.confidenceGaps}
                coverage={explanation.coverage}
                contradictions={state.status === "ready" ? state.contradictions : []}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
