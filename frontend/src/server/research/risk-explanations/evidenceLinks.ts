/**
 * Resolves each factor's `sourceLabel` against the sources the report actually
 * carried.
 *
 * A factor that names a source the report never listed is *not* silently
 * dropped and *not* promoted to a real link: it keeps an explicit `label_only`
 * state so the workbench can show the claim without implying provenance.
 */
import type { IndexedFactor } from "./factorIndex";
import type { EvidenceLink, EvidenceSourceSummary, ExplanationAgentCard, ExplanationSource } from "./schema";

export type EvidenceResolver = {
  resolve: (entry: IndexedFactor) => EvidenceLink;
  summarize: (links: Array<{ key: string; link: EvidenceLink }>) => EvidenceSourceSummary[];
};

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function toSummarySource(source: ExplanationSource) {
  return {
    label: source.label,
    status: source.status,
    url: source.url,
    detail: source.detail,
    checkedAt: source.checkedAt,
    provider: source.provider,
    reliability: source.reliability,
  };
}

/**
 * Builds a resolver scoped to one report. Agent-local sources win over
 * report-level sources with the same label, because the agent card is the
 * nearer context for the factor.
 */
export function buildEvidenceResolver(
  reportSources: ExplanationSource[],
  agentCards: ExplanationAgentCard[],
): EvidenceResolver {
  const reportIndex = new Map<string, ExplanationSource[]>();

  for (const source of reportSources) {
    const key = normalizeLabel(source.label);
    const bucket = reportIndex.get(key);
    if (bucket) bucket.push(source);
    else reportIndex.set(key, [source]);
  }

  const agentIndex = new Map<string, Map<string, ExplanationSource[]>>();

  for (const card of agentCards) {
    const perAgent = new Map<string, ExplanationSource[]>();
    for (const source of card.sources) {
      const key = normalizeLabel(source.label);
      const bucket = perAgent.get(key);
      if (bucket) bucket.push(source);
      else perAgent.set(key, [source]);
    }
    agentIndex.set(card.agent, perAgent);
  }

  const allSources = new Map<string, ExplanationSource>();
  for (const source of [...reportSources, ...agentCards.flatMap((card) => card.sources)]) {
    if (!allSources.has(source.label)) allSources.set(source.label, source);
  }

  function resolve(entry: IndexedFactor): EvidenceLink {
    const claimedLabel = entry.factor.sourceLabel?.trim();

    if (!claimedLabel) {
      return {
        state: "unlinked",
        note: "The factor did not name a source. No provenance is claimed for this contribution.",
      };
    }

    const key = normalizeLabel(claimedLabel);
    const candidates = agentIndex.get(entry.agent)?.get(key) ?? reportIndex.get(key) ?? [];

    if (candidates.length === 0) {
      return {
        state: "label_only",
        claimedLabel,
        note: "The factor named a source the report does not list. Only the label is available.",
      };
    }

    if (candidates.length > 1) {
      const distinct = new Set(candidates.map((candidate) => `${candidate.status}|${candidate.url ?? ""}|${candidate.provider ?? ""}`));

      if (distinct.size > 1) {
        return {
          state: "ambiguous",
          claimedLabel,
          source: toSummarySource(candidates[0]),
          note: `${candidates.length} sources share this label with differing status or provider. The first match is shown and the link is marked ambiguous.`,
        };
      }
    }

    return { state: "resolved", claimedLabel, source: toSummarySource(candidates[0]) };
  }

  function summarize(links: Array<{ key: string; link: EvidenceLink }>): EvidenceSourceSummary[] {
    const byLabel = new Map<string, EvidenceSourceSummary>();

    for (const source of allSources.values()) {
      byLabel.set(source.label, { ...toSummarySource(source), contributionKeys: [] });
    }

    for (const { key, link } of links) {
      const label = link.source?.label ?? link.claimedLabel;
      if (!label) continue;

      const existing = byLabel.get(label);

      if (existing) {
        existing.contributionKeys.push(key);
        continue;
      }

      byLabel.set(label, {
        label,
        status: "unavailable",
        detail: "Referenced by a factor but absent from the report source list.",
        contributionKeys: [key],
      });
    }

    return [...byLabel.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  return { resolve, summarize };
}
