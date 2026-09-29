"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ArticleRef } from "@/server/research/news-lineage/schema";

/**
 * The original evidence behind a lineage.
 *
 * Provider identifiers and canonical URLs are retained verbatim so a decision
 * can be traced back. URLs are shown as text, never as links: this feature does
 * not send a reader to an attacker-supplied address on its own authority.
 */
export function ArticleEvidence({ articles }: { articles: ArticleRef[] }) {
  if (articles.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No article evidence to show.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Original evidence, retained verbatim. URLs are shown as text rather than links.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Article</th>
            <th scope="col" className="py-2 pr-3">Outlet</th>
            <th scope="col" className="py-2 pr-3">Role</th>
            <th scope="col" className="py-2 pr-3">Language</th>
            <th scope="col" className="py-2 pr-3">References</th>
          </tr>
        </thead>
        <tbody>
          {articles.map((article) => (
            <tr key={article.articleId} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 font-medium">
                {article.title}
                {article.summary ? (
                  <span className="mt-1 block text-xs font-normal text-subtle">{article.summary}</span>
                ) : null}
              </th>
              <td className="py-2 pr-3 text-xs">
                {article.domain}
                {article.syndicatedFrom ? (
                  <span className="block text-subtle">attributes to {article.syndicatedFrom}</span>
                ) : null}
              </td>
              <td className="py-2 pr-3 text-xs">
                <StatusBadge tone={article.role === "independent" ? "success" : "neutral"}>
                  {article.role.replace(/_/g, " ")}
                </StatusBadge>
                <span className="mt-1 block text-subtle">{article.roleReason}</span>
              </td>
              <td className="py-2 pr-3 text-xs">
                {article.language ?? <span className="text-subtle">undeclared</span>}
                <span className="block text-subtle">{article.tokenCount} tokens</span>
              </td>
              <td className="py-2 pr-3 text-xs">
                {article.originalId ? (
                  <span className="block break-all font-mono text-[11px]">provider {article.originalId}</span>
                ) : null}
                {article.canonicalUrl ? (
                  <span className="block break-all font-mono text-[11px] text-subtle">{article.canonicalUrl}</span>
                ) : (
                  <span className="block text-subtle">No usable web URL</span>
                )}
                {article.correctionOf ? (
                  <span className="block text-[#f2c86d]">corrects {article.correctionOf}</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
