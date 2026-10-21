import type { DataEntryView } from "@/server/research/account-data-entries/schema";

export function EntryTable({ entries, selectedKey, onSelect }: { entries: DataEntryView[]; selectedKey: string | null; onSelect: (key: string) => void }) {
  return (
    <section data-testid="entry-table" className="overflow-x-auto rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Data entries</h2>
      <table className="mt-3 w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="text-subtle">
            <th className="py-2 pr-3">Key</th>
            <th className="py-2 pr-3">Format</th>
            <th className="py-2 pr-3">Recent</th>
            <th className="py-2">Format changed</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.key} className={entry.key === selectedKey ? "bg-white/5" : undefined}>
              <td className="py-2 pr-3">
                <button type="button" className="font-mono underline underline-offset-2" onClick={() => onSelect(entry.key)}>
                  {entry.key}
                </button>
                {entry.present ? null : <span className="ml-2 text-xs text-subtle">Deleted</span>}
              </td>
              <td className="py-2 pr-3">{entry.format ?? "deleted"}</td>
              <td className="py-2 pr-3">{entry.recent ? "Yes" : "No"}</td>
              <td className="py-2">{entry.formatChanged ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
