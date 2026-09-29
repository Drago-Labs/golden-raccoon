import type { ReserveCounters } from "@/server/research/reserve-planner/schema";

export function SponsorshipPanel({ before, after }: { before: ReserveCounters; after: ReserveCounters }) {
  const items: [keyof ReserveCounters, string][] = [["subentryCount", "Subentries"], ["numSponsoring", "Entries sponsored for others"], ["numSponsored", "Own entries sponsored"]];
  return <section className="rounded-2xl border border-white/10 p-5"><h2 className="text-lg font-semibold">Sponsorship counters</h2><div className="mt-4 grid gap-3 sm:grid-cols-3">{items.map(([key, label]) => <div key={key} className="rounded-xl bg-black/20 p-3"><div className="text-xs text-white/45">{label}</div><div className="mt-1 text-lg">{before[key]} <span aria-hidden>→</span><span className="sr-only">to</span> {after[key]}</div></div>)}</div></section>;
}
