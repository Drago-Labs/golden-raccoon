type WindowSelectorProps = {
  windowStart: string;
  windowEnd: string;
  disabled: boolean;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
};

export function WindowSelector({
  windowStart,
  windowEnd,
  disabled,
  onStart,
  onEnd,
}: WindowSelectorProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="windowStart" className="text-sm font-medium">
          Window Start (Ledger)
        </label>
        <input
          id="windowStart"
          type="number"
          value={windowStart}
          onChange={(e) => onStart(e.target.value)}
          disabled={disabled}
          placeholder="10"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="windowEnd" className="text-sm font-medium">
          Window End (Ledger)
        </label>
        <input
          id="windowEnd"
          type="number"
          value={windowEnd}
          onChange={(e) => onEnd(e.target.value)}
          disabled={disabled}
          placeholder="100"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
    </div>
  );
}
