export function EventFilter(props: {
  topicFilter: string;
  onTopicFilterChange: (v: string) => void;
  showRaw: boolean;
  onToggleRaw: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3 text-xs">
      <label className="flex items-center gap-2">
        <span className="text-white/70">Filter topic / event name:</span>
        <input
          aria-label="Filter topic or event name"
          value={props.topicFilter}
          onChange={(e) => props.onTopicFilterChange(e.target.value)}
          placeholder="e.g. transfer"
          className="rounded border border-white/15 bg-black/40 px-2 py-1 font-mono"
        />
      </label>
      <button
        type="button"
        onClick={props.onToggleRaw}
        className="rounded border border-white/20 px-3 py-1 text-xs text-white"
      >
        {props.showRaw ? "Hide raw ScVal view" : "Show raw ScVal view"}
      </button>
    </div>
  );
}
