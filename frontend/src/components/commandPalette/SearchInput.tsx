import { MAX_QUERY_LENGTH } from "@/lib/commandPalette/schema";
export function SearchInput({ value, onChange, activeId }: { value: string; onChange: (value: string) => void; activeId?: string }) {
  return <div><label htmlFor="command-search" className="block text-sm font-medium">Search pages and session assets</label>
    <input id="command-search" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="command-results"
      aria-activedescendant={activeId} aria-describedby="command-help" value={value} maxLength={MAX_QUERY_LENGTH}
      onChange={event => onChange(event.target.value)} autoComplete="off" spellCheck={false}
      className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]" />
  </div>;
}
