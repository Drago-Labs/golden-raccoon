import type { WindowPreset } from "@/server/research/counterparty-flows/schema";

type WindowSelectorProps = {
  window: WindowPreset;
  disabled: boolean;
  onWindow: (value: WindowPreset) => void;
};

const OPTIONS: Array<{ value: WindowPreset; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

export function WindowSelector({ window, disabled, onWindow }: WindowSelectorProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="counterparty-window" className="text-sm font-medium">
        Window
      </label>
      <select
        id="counterparty-window"
        value={window}
        disabled={disabled}
        onChange={(event) => onWindow(event.target.value as WindowPreset)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50 sm:w-56"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
