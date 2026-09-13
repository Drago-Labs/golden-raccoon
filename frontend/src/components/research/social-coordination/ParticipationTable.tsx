"use client";

import type { ParticipationRow } from "@/server/research/social-coordination/schema";

/**
 * Messages per author account.
 *
 * Author keys are the opaque values the caller supplied and are shown as such.
 * Nothing here resolves one to a person, and the table carries no judgement
 * about any account.
 */
export function ParticipationTable({ participation }: { participation: ParticipationRow[] }) {
  if (participation.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No analysable observation carried an author key.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Messages per author account. Keys are opaque values supplied with the observations; no account is identified or
          characterised.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Author key</th>
            <th scope="col" className="py-2 pr-3">Messages</th>
            <th scope="col" className="py-2 pr-3">Share</th>
            <th scope="col" className="py-2 pr-3">Repeat clusters</th>
            <th scope="col" className="py-2 pr-3">Active between</th>
          </tr>
        </thead>
        <tbody>
          {participation.map((row) => (
            <tr key={row.authorKey} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 break-all font-mono text-xs font-medium">{row.authorKey}</th>
              <td className="py-2 pr-3 text-xs tabular-nums">{row.observationCount}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">{Math.round(row.share * 1000) / 10}%</td>
              <td className="py-2 pr-3 text-xs tabular-nums">{row.distinctClusterCount}</td>
              <td className="py-2 pr-3 text-xs">
                {row.firstPostedAt ? (
                  <>
                    <span className="block font-mono text-[11px]">{row.firstPostedAt}</span>
                    <span className="block font-mono text-[11px] text-subtle">{row.lastPostedAt}</span>
                  </>
                ) : (
                  <span className="text-subtle">No readable timestamps</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
